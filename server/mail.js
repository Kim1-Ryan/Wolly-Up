import { randomUUID } from 'node:crypto';
import process from 'node:process';

export function emailConfigured(config = process.env) {
  return config.EMAIL_PROVIDER === 'resend' && Boolean(config.RESEND_API_KEY && config.EMAIL_FROM && config.PUBLIC_APP_URL);
}

export function welcomeEmail(profile, contact, payload, publicAppUrl) {
  const link = new URL(publicAppUrl);
  if (!['https:','http:'].includes(link.protocol)) throw new Error('PUBLIC_APP_URL must be a website URL.');
  link.search = '';
  link.hash = '';
  const unsubscribe = new URL(link);
  unsubscribe.searchParams.set('unsubscribe',contact.unsubscribe_token);
  link.searchParams.set('ref',profile.referral_code);
  return {
    subject: 'Welcome to Wolly Up!',
    text: `Hi ${profile.name},\n\nWelcome to Wolly Up! Find golf lessons, connect with the community and manage your bookings from your profile.\n\nEarn free tokens\nEarn 10 tokens whenever a new friend signs up using your personal referral link. Your friend receives 5 free tokens too.\n\nYour referral link:\n${link.href}\n\n${payload.referralRewarded ? 'Your 5 referral tokens have been added to your wallet.\n\n' : ''}You can find your link and token balance on your profile. Referral rewards apply once per new friend’s email address.\n\nManage marketing emails: ${unsubscribe.href}\nUnsubscribing from marketing does not stop important emails about your account, data or bookings.\n\nThe Wolly Up team`
  };
}

export async function queueEmail(pool, userId, { kind, eventKey, subject, text }) {
  if (!['account','marketing'].includes(kind) || !eventKey || !subject || !text) throw new Error('Provide an email type, unique event key, subject and message.');
  return pool.query(`INSERT INTO email_outbox(id,user_id,kind,event_key,payload)
    SELECT $1,p.id,$3,$4,$5 FROM profiles p JOIN email_contacts c ON c.user_id=p.id
    WHERE p.id=$2 AND p.deleted_at IS NULL AND ($3<>'marketing' OR c.marketing_subscribed)
    ON CONFLICT(event_key) DO NOTHING`,[randomUUID(),userId,kind,eventKey,JSON.stringify({subject,text})]);
}

export async function processEmailQueue(pool, { config = process.env, send = fetch, limit = 10 } = {}) {
  if (!emailConfigured(config)) return { configured:false, sent:0 };
  await pool.query("UPDATE email_outbox SET status='failed',updated_at=NOW() WHERE status='sending' AND attempts>=5 AND updated_at<NOW()-INTERVAL '10 minutes'");
  // A claim is atomic; concurrent workers cannot deliver the same queue item.
  const claimed = await pool.query(`UPDATE email_outbox SET status='sending',attempts=attempts+1,updated_at=NOW()
    WHERE id IN (SELECT id FROM email_outbox
      WHERE attempts<5 AND ((status='pending' AND next_attempt_at<=NOW()) OR (status='sending' AND updated_at<NOW()-INTERVAL '10 minutes'))
      ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING *`,[limit]);
  let sent=0;
  for (const item of claimed.rows) {
    try {
      const account = (await pool.query(`SELECT p.name,p.referral_code,c.email,c.unsubscribe_token,c.marketing_subscribed
        FROM profiles p JOIN email_contacts c ON c.user_id=p.id WHERE p.id=$1 AND p.deleted_at IS NULL`,[item.user_id])).rows[0];
      if (!account || (item.kind==='marketing' && !account.marketing_subscribed)) {
        await pool.query("UPDATE email_outbox SET status='suppressed',updated_at=NOW() WHERE id=$1",[item.id]);continue;
      }
      const content = item.kind==='welcome' ? welcomeEmail(account,account,item.payload,config.PUBLIC_APP_URL) : {subject:item.payload.subject,text:item.payload.text};
      if (item.kind==='marketing') {
        const unsubscribe=new URL(config.PUBLIC_APP_URL);
        unsubscribe.search='';unsubscribe.hash='';unsubscribe.searchParams.set('unsubscribe',account.unsubscribe_token);
        content.text+=`\n\nUnsubscribe from marketing emails: ${unsubscribe.href}\nImportant account emails are unaffected.`;
      }
      const response = await send('https://api.resend.com/emails', {
        method:'POST',signal:AbortSignal.timeout(8000),
        headers:{Authorization:`Bearer ${config.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':item.event_key},
        body:JSON.stringify({from:config.EMAIL_FROM,to:[account.email],...content})
      });
      if (!response.ok) throw new Error('Email delivery was not accepted.');
      await pool.query("UPDATE email_outbox SET status='sent',updated_at=NOW(),payload='{}'::jsonb WHERE id=$1",[item.id]);
      sent++;
    } catch {
      await pool.query(`UPDATE email_outbox SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
        next_attempt_at=NOW()+INTERVAL '10 minutes',updated_at=NOW() WHERE id=$1`,[item.id]);
    }
  }
  return { configured:true,sent };
}
