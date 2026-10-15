import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { createSession } from './verification.js';
import { sessionUser } from './tokens.js';

export const referralCodeValid = code => typeof code === 'string' && /^[a-f0-9]{32}$/.test(code);
const invalid = message => Object.assign(new Error(message), { statusCode: 400 });

export async function createAccount(pool, fields, { referralCode, marketingEmails = false } = {}) {
  if (referralCode && !referralCodeValid(referralCode)) throw invalid('This referral link is invalid. Check the link or remove the referral code to continue.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let referrer;
    if (referralCode) {
      referrer = (await client.query('SELECT id,email FROM profiles WHERE referral_code=$1 AND deleted_at IS NULL FOR UPDATE', [referralCode])).rows[0];
      if (!referrer) throw invalid('This referral link is no longer available. Remove the referral code to continue without it.');
      if (referrer.email.toLowerCase() === fields[2].toLowerCase()) throw invalid('Use a friend’s referral link. You cannot refer your own email address.');
    }
    const profile = (await client.query(`INSERT INTO profiles
      (id,name,email,password_hash,role,location,bio,age,expertise,title,profile_image,rates_structure,qualifications,is_verified)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,FALSE) RETURNING *`, fields)).rows[0];
    await client.query('INSERT INTO email_contacts(user_id,email,marketing_subscribed) VALUES ($1,$2,$3)', [profile.id,profile.email,marketingEmails === true]);
    let referralRewarded = false;
    if (referrer) {
      const reward = await client.query(`INSERT INTO referral_redemptions(email_hash,referrer_id,referred_id) VALUES ($1,$2,$3)
        ON CONFLICT(email_hash) DO NOTHING RETURNING referred_id`, [createHash('sha256').update(profile.email.trim().toLowerCase()).digest('hex'),referrer.id,profile.id]);
      if (reward.rowCount) {
        await client.query('UPDATE profiles SET token_balance=token_balance+10 WHERE id=$1', [referrer.id]);
        await client.query('UPDATE profiles SET token_balance=token_balance+5 WHERE id=$1', [profile.id]);
        await client.query('INSERT INTO token_transactions(id,user_id,amount,listing_id) VALUES ($1,$2,10,NULL),($3,$4,5,NULL)', [randomUUID(),referrer.id,randomUUID(),profile.id]);
        referralRewarded = true;
      }
    }
    await client.query(`INSERT INTO email_outbox(id,user_id,kind,event_key,payload) VALUES ($1,$2,'welcome',$3,$4)`, [randomUUID(),profile.id,`welcome:${profile.id}`,JSON.stringify({referralRewarded})]);
    const sessionToken = await createSession(client, profile.id);
    await client.query('COMMIT');
    return { profile, sessionToken, referralRewarded };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function deleteAccount(pool, userId, reason) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const profile = (await client.query('SELECT id FROM profiles WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [userId])).rows[0];
    if (!profile) throw invalid('This account has already been deleted.');
    await client.query('INSERT INTO account_deletions(id,reason) VALUES ($1,$2)', [randomUUID(),reason]);
    await client.query('DELETE FROM account_sessions WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM email_outbox WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM email_contacts WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM notification_reads WHERE user_id=$1', [userId]);
    await client.query(`UPDATE listings SET status='archived',title='Removed listing',content='',offer=NULL,price=0 WHERE author_id=$1`, [userId]);
    await client.query(`UPDATE bookings SET status=CASE WHEN status IN ('pending_coach_approval','awaiting_immediate_payment')
      OR (status='booking_confirmed_and_paid' AND EXISTS (SELECT 1 FROM jsonb_array_elements(details->'sessions') s
        WHERE (s->>'date') || 'T' || (s->>'time') > to_char(NOW() AT TIME ZONE 'Africa/Johannesburg','YYYY-MM-DD"T"HH24:MI')))
      THEN 'cancelled' ELSE status END,
      change_request=NULL, change_log='[]'::jsonb WHERE learner_id=$1 OR coach_id=$1`, [userId]);
    await client.query('DELETE FROM booking_venue_log WHERE accepted_by=$1 OR message_id IN (SELECT id FROM messages WHERE sender_id=$1)', [userId]);
    await client.query("UPDATE messages SET text='Message removed',location=NULL WHERE sender_id=$1", [userId]);
    await client.query("UPDATE lesson_feedback SET comment='' WHERE user_id=$1", [userId]);
    await client.query(`UPDATE profiles SET deleted_at=NOW(),name='Deleted account',email=$2,password_hash=$3,
      location=NULL,bio=NULL,age=NULL,expertise=NULL,title=NULL,profile_image=NULL,rates_structure=NULL,
      qualifications='[]'::jsonb,is_verified=FALSE,persona_inquiry_id=NULL,persona_status=NULL,persona_environment=NULL,
      token_balance=0,referral_code=NULL WHERE id=$1`, [userId,`${randomUUID()}@deleted.invalid`,randomBytes(64).toString('hex')]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function handleAccount(request,response,url,pool,readBody,sendJson) {
  if (url.pathname === '/api/email/unsubscribe' && request.method === 'POST') {
    const { token } = await readBody(request);
    if (typeof token !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(token)) { sendJson(response,400,{error:'This unsubscribe link is invalid.'});return true; }
    const result = await pool.query('UPDATE email_contacts SET marketing_subscribed=FALSE,updated_at=NOW() WHERE unsubscribe_token=$1 RETURNING user_id',[token]);
    sendJson(response,result.rowCount?200:404,result.rowCount?{unsubscribed:true}:{error:'This unsubscribe link is no longer available.'});return true;
  }
  if (!['/api/account','/api/account/email-preferences'].includes(url.pathname)) return false;
  const userId = await sessionUser(request,pool);
  if (!userId) {sendJson(response,401,{error:'Please sign in again.'});return true;}
  if (request.method === 'GET' && url.pathname === '/api/account') {
    const profile = (await pool.query(`SELECT p.email,p.referral_code,c.marketing_subscribed,
      (SELECT COUNT(*)::int FROM referral_redemptions r WHERE r.referrer_id=p.id) AS referrals
      FROM profiles p LEFT JOIN email_contacts c ON c.user_id=p.id WHERE p.id=$1 AND p.deleted_at IS NULL`,[userId])).rows[0];
    if (!profile) {sendJson(response,404,{error:'Account unavailable.'});return true;}
    sendJson(response,200,{email:profile.email,referralCode:profile.referral_code,marketingEmails:Boolean(profile.marketing_subscribed),referrals:profile.referrals});return true;
  }
  if (request.method === 'PATCH' && url.pathname === '/api/account/email-preferences') {
    const { marketingEmails } = await readBody(request);
    if (typeof marketingEmails !== 'boolean') {sendJson(response,400,{error:'Choose whether to receive marketing emails.'});return true;}
    await pool.query('UPDATE email_contacts SET marketing_subscribed=$2,updated_at=NOW() WHERE user_id=$1',[userId,marketingEmails]);
    sendJson(response,200,{marketingEmails});return true;
  }
  if (request.method === 'DELETE' && url.pathname === '/api/account') {
    const { reason, confirmed } = await readBody(request);
    if (confirmed !== true || typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000) {
      sendJson(response,400,{error:'Confirm deletion and tell us why you’re leaving (up to 2,000 characters).'});return true;
    }
    await deleteAccount(pool,userId,reason.trim());
    sendJson(response,200,{deleted:true});return true;
  }
  sendJson(response,405,{error:'Method unavailable.'});return true;
}
