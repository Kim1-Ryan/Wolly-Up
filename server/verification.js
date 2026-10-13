import { randomBytes, createHash } from "node:crypto";

export const verificationSchema = `
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona_inquiry_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona_status TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona_environment TEXT;
CREATE TABLE IF NOT EXISTS account_sessions (
 token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES profiles(id),
 expires_at TIMESTAMPTZ NOT NULL
);`;
const hash = token => createHash("sha256").update(token).digest("hex");
export async function createSession(pool, userId) {
  const token = randomBytes(32).toString("hex");
  await pool.query("INSERT INTO account_sessions VALUES ($1,$2,NOW()+INTERVAL '7 days')", [hash(token), userId]);
  return token;
}
async function persona(path, options = {}) {
  const response = await fetch(`https://api.withpersona.com/api/v1${path}`, {
    ...options, signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${process.env.PERSONA_API_KEY}`, "Content-Type": "application/json", "Persona-Version": "2025-10-27" }
  });
  if (!response.ok) throw new Error("Identity verification is temporarily unavailable. Please try again later.");
  return (await response.json()).data;
}

export async function handleVerification(request, response, url, pool, sendJson) {
  if (url.pathname !== "/api/verification" || !["GET", "POST"].includes(request.method)) return false;
  const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  const session = token && (await pool.query("SELECT user_id FROM account_sessions WHERE token_hash=$1 AND expires_at>NOW()", [hash(token)])).rows[0];
  if (!session) { sendJson(response, 401, { error: "Please sign in again to verify your identity." }); return true; }
  const configured = Boolean(process.env.PERSONA_API_KEY && process.env.PERSONA_TEMPLATE_ID);
  let profile = (await pool.query("SELECT * FROM profiles WHERE id=$1", [session.user_id])).rows[0];
  if (!profile) { sendJson(response,404,{error:"Account not found."});return true; }
  try {
    if (request.method === "POST") {
      if (!configured) { sendJson(response,503,{error:"Identity verification is not available yet. Please check back later."});return true; }
      if (!profile.persona_inquiry_id || ['expired','failed','declined'].includes(profile.persona_status)) {
        const inquiry = await persona("/inquiries", {method:"POST", body:JSON.stringify({data:{attributes:{
          "inquiry-template-id":process.env.PERSONA_TEMPLATE_ID,"reference-id":profile.id
        }}})});
        if (!/^inq_[a-zA-Z0-9]+$/.test(inquiry.id)) throw new Error("Unable to start identity verification.");
        profile = (await pool.query(`UPDATE profiles SET persona_inquiry_id=$1,persona_status=$2,
          persona_environment=$3,is_verified=FALSE WHERE id=$4 RETURNING *`,
          [inquiry.id,inquiry.attributes.status,process.env.PERSONA_ENVIRONMENT || 'sandbox',profile.id])).rows[0];
      }
      sendJson(response,200,{url:`https://inquiry.withpersona.com/verify?inquiry-id=${encodeURIComponent(profile.persona_inquiry_id)}`});return true;
    }
    if (configured && profile.persona_inquiry_id) {
      const inquiry = await persona(`/inquiries/${encodeURIComponent(profile.persona_inquiry_id)}`);
      if (inquiry.attributes["reference-id"] !== profile.id) throw new Error("Unable to confirm identity verification for this account.");
      profile = (await pool.query("UPDATE profiles SET persona_status=$1,is_verified=$2 WHERE id=$3 RETURNING *",
        [inquiry.attributes.status,inquiry.attributes.status==='approved' && profile.persona_environment==='production',profile.id])).rows[0];
    }
    sendJson(response,200,{configured,status:profile.persona_status || 'not_started',
      isVerified:profile.persona_status==='approved' && profile.persona_environment==='production',
      sandbox:profile.persona_environment!=='production'});
  } catch (error) { sendJson(response,502,{error:error.message}); }
  return true;
}
