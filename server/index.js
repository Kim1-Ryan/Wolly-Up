import http from "node:http";
import { randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { pool } from "./db.js";
import { bookingSchema, handleBookings, confirmMissingDurations, repairLegacyBookingDurations } from "./bookings.js";
import { inboxSchema, handleInbox } from "./inbox.js";
import { verificationSchema, createSession, handleVerification } from "./verification.js";
import { profileRatings, rankProfiles } from "./ratings.js";
import { handleListings, listingSchema } from './listings.js';
import { handleTokens, tokenSchema } from './tokens.js';

const port = process.env.PORT || 3002;
const scrypt = promisify(scryptCallback);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function publicProfile(profile) {
  const { password_hash, is_verified, rates_structure, profile_image, persona_inquiry_id, persona_status, persona_environment, token_balance, paid_listing_count, ...safeProfile } = profile;
  return {
    ...safeProfile,
    qualifications: (profile.qualifications || []).filter(qualification =>
      typeof qualification === 'string' && !/identity and profile documents verified/i.test(qualification)),
    ...await profileRatings(pool, profile.id),
    isVerified: Boolean(profile.persona_status === "approved" && profile.persona_environment === "production"),
    ratesStructure: rates_structure,
    profileImage: profile_image || null
  };
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function hashPassword(password) {
  const salt = randomUUID();
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function passwordMatches(password, storedHash) {
  const [salt, key] = storedHash.split(":");
  const derivedKey = await scrypt(password, salt, 64);
  return timingSafeEqual(Buffer.from(key, "hex"), derivedKey);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (await handleTokens(request,response,url,pool,readBody,sendJson)) return;
    if (await handleListings(request,response,url,pool,readBody,sendJson)) return;
    if (await handleBookings(request, response, url, pool, readBody, sendJson)) return;
    if (await handleInbox(request, response, url, pool, readBody, sendJson)) return;
    if (await handleVerification(request, response, url, pool, sendJson)) return;
    const ratingsMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)\/ratings$/);
    if (ratingsMatch && request.method === 'GET') {
      sendJson(response, 200, await profileRatings(pool, ratingsMatch[1]));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/profiles") {
      const query = (url.searchParams.get("q") || "").trim();
      const role=url.searchParams.get('role');
      if(role && !['coach','learner'].includes(role)){sendJson(response,400,{error:'Invalid profile role.'});return;}
      const result = await pool.query(
        `SELECT id, name, role, location, bio, expertise, title, profile_image,
                rates_structure, qualifications, is_verified, persona_status, persona_environment
         FROM profiles
         WHERE ($1='' OR strpos(lower(concat_ws(' ', name, role, location, bio, expertise, title)), lower($1)) > 0)
           AND ($2::text IS NULL OR role=$2)
         ORDER BY lower(name), id`,
        [query,role]
      );
      sendJson(response, 200, rankProfiles(await Promise.all(result.rows.map(publicProfile))));
      return;
    }
    if (request.method === "POST" && request.url === "/api/auth/register") {
      const data = await readBody(request);
      const email = data.email?.trim().toLowerCase();
      if (!email) {
        sendJson(response, 400, { error: "An email address is required." });
        return;
      }
      const passwordHash = await hashPassword(data.password);
      const offerings = Array.isArray(data.offerings) ? data.offerings : [];
      const profileImage = data.profileImage;
      if (profileImage != null && (typeof profileImage !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(profileImage) || profileImage.length > 7_000_000)) {
        sendJson(response, 400, { error: 'Choose a JPG, PNG, or WebP profile photo smaller than 5 MB.' });
        return;
      }
      if (data.role === "coach" && (
        typeof profileImage !== "string" ||
        !/^data:image\/(jpeg|png|webp);base64,/.test(profileImage) ||
        profileImage.length > 7_000_000 ||
        data.profilePhotoConfirmed !== true
      )) {
        sendJson(response, 400, { error: "Coaches must upload a valid profile photo smaller than 5 MB." });
        return;
      }
      if (data.role === "coach" && (
        offerings.length === 0 ||
        offerings.some(({ category, packSize, rate, durationMinutes }) => !category || !packSize || !Number.isFinite(rate) || rate < 0 || !Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480)
      )) {
        sendJson(response, 400, { error: "Select at least one lesson option and provide a valid rate and lesson duration (5–480 minutes) for each." });
        return;
      }
      const ratesStructure = data.role === "coach" ? {
        offerings: offerings.map(({ category, packSize, rate, durationMinutes }) => ({
          category,
          packSize,
          durationMinutes,
          formattedRate: `R ${Number(rate).toFixed(2)}`
        }))
      } : null;
      const result = await pool.query(
        `INSERT INTO profiles
          (id, name, email, password_hash, role, location, bio, age, expertise, title, profile_image, rates_structure, qualifications, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, FALSE)
         RETURNING *`,
        [
          randomUUID(), data.name, email, passwordHash, data.role,
          data.location, data.bio, data.age, data.expertise || null, data.title || null,
          profileImage, ratesStructure, JSON.stringify([])
        ]
      );
      sendJson(response, 201, { ...await publicProfile(result.rows[0]), sessionToken: await createSession(pool, result.rows[0].id) });
      return;
    }

    const profileUpdateMatch = request.url.match(/^\/api\/profiles\/([^/?]+)$/);
    if (request.method === "PATCH" && profileUpdateMatch) {
      const data = await readBody(request);
      const existing = (await pool.query('SELECT role FROM profiles WHERE id=$1', [profileUpdateMatch[1]])).rows[0];
      if (!existing) { sendJson(response, 404, { error: 'Profile not found.' }); return; }
      if (existing.role === 'learner') {
        if (data.profileImage != null && (typeof data.profileImage !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(data.profileImage) || data.profileImage.length > 7_000_000)) {
          sendJson(response, 400, { error: 'Choose a JPG, PNG, or WebP profile photo smaller than 5 MB.' }); return;
        }
        if (!['beginner', 'intermediate', 'advanced'].includes(data.expertise)) {
          sendJson(response, 400, { error: 'Choose a valid skill level.' }); return;
        }
        const result = await pool.query(`UPDATE profiles SET bio=$1, expertise=$2,
          profile_image=CASE WHEN $3 THEN $4 ELSE profile_image END WHERE id=$5 RETURNING *`,
          [data.bio || '', data.expertise, Object.hasOwn(data, 'profileImage'), data.profileImage || null, profileUpdateMatch[1]]);
        sendJson(response, 200, await publicProfile(result.rows[0])); return;
      }
      const offerings = Array.isArray(data.offerings) ? data.offerings : [];
      if (
        offerings.length === 0 ||
        offerings.some(({ category, packSize, rate, durationMinutes }) => !category || !packSize || !Number.isFinite(rate) || rate < 0 || !Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480)
      ) {
        sendJson(response, 400, { error: "Select at least one lesson option and provide a valid rate and lesson duration (5–480 minutes) for each." });
        return;
      }
      const profileImage = data.profileImage || null;
      if (profileImage && (
        typeof profileImage !== "string" ||
        !/^data:image\/(jpeg|png|webp);base64,/.test(profileImage) ||
        profileImage.length > 7_000_000
      )) {
        sendJson(response, 400, { error: "Your profile photo must be a JPG, PNG, or WebP image smaller than 5 MB." });
        return;
      }
      if (data.title !== undefined && (typeof data.title !== 'string' || !data.title.trim() || data.title.trim().length > 120)) {
        sendJson(response, 400, { error: 'Enter a professional title of up to 120 characters.' });
        return;
      }
      const ratesStructure = {
        offerings: offerings.map(({ category, packSize, rate, durationMinutes }) => ({
          category,
          packSize,
          durationMinutes,
          formattedRate: `R ${Number(rate).toFixed(2)}`
        }))
      };
      const result = await pool.query(
        `UPDATE profiles
         SET bio = $1,
             profile_image = $2,
             rates_structure = $3,
             title = COALESCE($5, title)
         WHERE id = $4
         RETURNING *`,
        [data.bio || "", profileImage, ratesStructure, profileUpdateMatch[1], data.title === undefined ? null : data.title.trim()]
      );
      if (result.rowCount === 0) {
        sendJson(response, 404, { error: "Profile not found." });
        return;
      }
      await confirmMissingDurations(pool, profileUpdateMatch[1], ratesStructure.offerings);
      sendJson(response, 200, await publicProfile(result.rows[0]));
      return;
    }

    if (request.method === "POST" && request.url === "/api/auth/login") {
      const { email, password } = await readBody(request);
      const normalizedEmail = email?.trim().toLowerCase();
      if (!normalizedEmail) {
        sendJson(response, 400, { error: "An email address is required." });
        return;
      }
      const result = await pool.query("SELECT * FROM profiles WHERE LOWER(email) = $1", [normalizedEmail]);
      const profile = result.rows[0];
      if (!profile || !(await passwordMatches(password, profile.password_hash))) {
        sendJson(response, 401, { error: "Incorrect email or password." });
        return;
      }
      sendJson(response, 200, { ...await publicProfile(profile), sessionToken: await createSession(pool, profile.id) });
      return;
    }

  if (request.method === "GET" && request.url === "/api/health") {
    try {
      const result = await pool.query("SELECT current_database() AS database, NOW() AS connected_at");
      sendJson(response, 200, { connected: true, ...result.rows[0] });
    } catch (error) {
      sendJson(response, 503, { connected: false, error: error.message });
    }
    return;
  }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(`API error for ${request.method} ${request.url}:`, error.message);
    if (error.code === "23505") {
      sendJson(response, 409, { error: "An account already exists for that email." });
      return;
    }
    sendJson(response, 500, { error: `Unable to save the request: ${error.message}` });
  }
});

async function startServer() {
  await pool.query(verificationSchema);
  await pool.query(bookingSchema);
  await pool.query(inboxSchema);
  await repairLegacyBookingDurations(pool);
  await pool.query("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_image TEXT");
  await pool.query(`CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    price NUMERIC(10, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(listingSchema);
  await pool.query(tokenSchema);
  server.listen(port, () => {
    console.log(`Wolly Up API listening on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Unable to prepare the Wolly Up database:", error.message);
  process.exitCode = 1;
});
