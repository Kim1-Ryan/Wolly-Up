import http from "node:http";
import { randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { serveFrontend } from './static.js';
import { pool } from "./db.js";
import { bookingSchema, handleBookings, confirmMissingDurations, repairLegacyBookingDurations } from "./bookings.js";
import { inboxSchema, handleInbox } from "./inbox.js";
import { verificationSchema, createSession, handleVerification } from "./verification.js";
import { profileRatings, rankProfiles } from "./ratings.js";
import { handleListings, listingSchema } from './listings.js';
import { handleTokens, tokenSchema, sessionUser, sessionProfile } from './tokens.js';
import { validPackageWindow, validityMonths } from '../src/packages.js';
import { createAccount, handleAccount } from './accounts.js';
import { processEmailQueue } from './mail.js';

const port = process.env.PORT || 3002;
const scrypt = promisify(scryptCallback);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function publicProfile(profile, includeRatings = true) {
  const { password_hash, is_verified, rates_structure, profile_image, persona_inquiry_id, persona_status, persona_environment, token_balance, paid_listing_count, ...safeProfile } = profile;
  return {
    ...safeProfile,
    qualifications: (profile.qualifications || []).filter(qualification =>
      typeof qualification === 'string' && !/identity and profile documents verified/i.test(qualification)),
    ...(includeRatings ? await profileRatings(pool, profile.id) : {}),
    isVerified: Boolean(profile.persona_status === "approved" && profile.persona_environment === "production"),
    ratesStructure: rates_structure,
    profileImage: profile_image || null
  };
}

async function readBody(request) {
  if(request.parsedBody!==undefined)return request.parsedBody;
  let body = "";
  for await (const chunk of request) body += chunk;
  request.parsedBody=body ? JSON.parse(body) : {};
  return request.parsedBody;
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

export async function handleRequest(request, response) {
  try {
    const origin=request.headers.origin;
    const allowedOrigins=(process.env.FRONTEND_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean);
    if(origin&&allowedOrigins.includes(origin)) {
      response.setHeader('Access-Control-Allow-Origin',origin);
      response.setHeader('Vary','Origin');
      response.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
      response.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS');
    }
    if(request.method==='OPTIONS'){response.writeHead(204);response.end();return;}
    const url = new URL(request.url, "http://localhost");
    if(await serveFrontend(request,response,url))return;
    if (request.method === 'GET' && url.pathname === '/api/auth/session') {
      const profile = await sessionProfile(request, pool);
      if (!profile) { sendJson(response, 401, { error: 'Please sign in again.' }); return; }
      // Ratings refresh independently once the app opens.
      sendJson(response, 200, await publicProfile(profile, false));
      return;
    }
    const publicRoute=(request.method==='POST'&&['/api/auth/login','/api/auth/register','/api/email/unsubscribe'].includes(url.pathname)) ||
      (request.method==='GET'&&(url.pathname==='/api/health'||url.pathname==='/api/profiles'||/^\/api\/profiles\/[^/]+\/ratings$/.test(url.pathname)||/^\/api\/coaches\/[^/]+\/availability$/.test(url.pathname)||(url.pathname==='/api/listings'&&!url.searchParams.get('userId'))));
    if(url.pathname.startsWith('/api/')&&!publicRoute) {
      const userId=await sessionUser(request,pool);
      if(!userId){sendJson(response,401,{error:'Please sign in again.'});return;}
      const queriedUser=url.searchParams.get('userId');
      const profileEdit=url.pathname.match(/^\/api\/profiles\/([^/]+)$/);
      if((queriedUser&&queriedUser!==userId)||(request.method==='PATCH'&&profileEdit&&profileEdit[1]!==userId)) {
        sendJson(response,403,{error:'You can only access your own account data.'});return;
      }
      if(['POST','PATCH','DELETE'].includes(request.method)) {
        const data=await readBody(request);
        if(['userId','authorId','learnerId'].some(key=>data[key]!==undefined && data[key]!==userId)) {
          sendJson(response,403,{error:'This action is not available for your account.'});return;
        }
      }
    }
    if (await handleAccount(request,response,url,pool,readBody,sendJson)) return;
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
         WHERE deleted_at IS NULL AND ($1='' OR strpos(lower(concat_ws(' ', name, role, location, bio, expertise, title)), lower($1)) > 0)
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
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(response, 400, { error: "Enter a valid email address." });
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
        offerings.some(offer => !validPackageWindow(offer) || !offer.category || !offer.packSize || !Number.isFinite(offer.rate) || offer.rate < 0 || !Number.isInteger(offer.durationMinutes) || offer.durationMinutes < 5 || offer.durationMinutes > 480)
      )) {
        sendJson(response, 400, { error: "Each package needs a valid price, a lesson duration of 5–480 minutes, and a validity period of 1, 3 or 6 months. One year is available only for packages of 10 lessons or more." });
        return;
      }
      const ratesStructure = data.role === "coach" ? {
        offerings: offerings.map(({ category, packSize, rate, durationMinutes, validityMonths: months }) => ({
          category,
          packSize,
          durationMinutes,
          validityMonths: validityMonths({ validityMonths: months }),
          formattedRate: `R ${Number(rate).toFixed(2)}`
        }))
      } : null;
      const account = await createAccount(pool,
        [
          randomUUID(), data.name, email, passwordHash, data.role,
          data.location, data.bio, data.age, data.expertise || null, data.title || null,
          profileImage, ratesStructure, JSON.stringify([])
        ], {referralCode:data.referralCode,marketingEmails:data.marketingEmails}
      );
      sendJson(response, 201, { ...await publicProfile(account.profile, false), sessionToken:account.sessionToken, referralRewarded:account.referralRewarded });
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
        offerings.some(offer => !validPackageWindow(offer) || !offer.category || !offer.packSize || !Number.isFinite(offer.rate) || offer.rate < 0 || !Number.isInteger(offer.durationMinutes) || offer.durationMinutes < 5 || offer.durationMinutes > 480)
      ) {
        sendJson(response, 400, { error: "Each package needs a valid price, a lesson duration of 5–480 minutes, and a validity period of 1, 3 or 6 months. One year is available only for packages of 10 lessons or more." });
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
        offerings: offerings.map(({ category, packSize, rate, durationMinutes, validityMonths: months }) => ({
          category,
          packSize,
          durationMinutes,
          validityMonths: validityMonths({ validityMonths: months }),
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
      const result = await pool.query("SELECT * FROM profiles WHERE LOWER(email) = $1 AND deleted_at IS NULL", [normalizedEmail]);
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
    if (error.statusCode) {sendJson(response,error.statusCode,{error:error.message});return;}
    if (error.code === "23505") {
      sendJson(response, 409, { error: "An account already exists for that email." });
      return;
    }
    sendJson(response, 500, { error: `Unable to save the request: ${error.message}` });
  }
}

export async function prepareDatabase() {
  await pool.query(await readFile(resolve('server/schema.sql'),'utf8'));
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
  await pool.query(await readFile(resolve('server/accounts-schema.sql'),'utf8'));
  if(process.env.DATABASE_PROVIDER==='supabase') {
    await pool.query(await readFile(resolve('server/supabase-security.sql'),'utf8'));
  }
}

async function startServer() {
  await prepareDatabase();
  const mailTimer=setInterval(()=>{void processEmailQueue(pool).catch(()=>console.error('Email queue processing failed.'));},30000);
  mailTimer.unref();
  const server=http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`Wolly Up API listening on http://localhost:${port}`);
  });
}

if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) startServer().catch((error) => {
  console.error("Unable to prepare the Wolly Up database:", error.message);
  process.exitCode = 1;
});
