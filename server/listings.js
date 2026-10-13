import { randomUUID } from 'node:crypto';
import { listingTokenCost, sessionUser } from './tokens.js';

export const listingSchema = `ALTER TABLE listings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS offer JSONB;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
UPDATE listings l SET status='pending_fee_configuration' FROM profiles p
 WHERE p.id=l.author_id AND p.role='coach' AND l.offer IS NULL AND l.status='active';`;

const select = `SELECT l.*, p.name AS author_name, p.role AS author_type, p.expertise, p.location
 FROM listings l JOIN profiles p ON p.id=l.author_id`;
export function presentListing(row) {
  return { id:row.id, title:row.title, content:row.content, price:Number(row.price), authorId:row.author_id,
    authorName:row.author_name, authorType:row.author_type, expertise:row.expertise, location:row.location,
    status:row.status, offer:row.offer, expiresAt:row.expires_at, createdAt:row.created_at };
}

export function offerTerms(data, regularPrice, now=Date.now()) {
  if(!data.isSpecial)return {expiresAt:null,specialPrice:null};
  const expiresAt=data.expiresAt ? new Date(data.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime()<=now)) throw new Error('Choose an expiry date and time in the future.');
  const specialPrice=data.isSpecial ? Number(data.specialPrice) : null;
  if(data.isSpecial && (!expiresAt || !Number.isFinite(specialPrice) || specialPrice<=0 || specialPrice>=regularPrice)) throw new Error('A special needs an expiry and a price lower than the regular package price.');
  return {expiresAt:expiresAt?.toISOString() || null,specialPrice};
}

export async function handleListings(request,response,url,pool,readBody,sendJson) {
  if (url.pathname === '/api/listings' && request.method === 'GET') {
    await pool.query("UPDATE listings SET status='expired' WHERE status IN ('active','pending_fee_configuration') AND expires_at<=NOW()");
    const result=await pool.query(`${select} WHERE l.status='active' OR l.author_id=$1 ORDER BY l.created_at DESC`,[url.searchParams.get('userId') || null]);
    sendJson(response,200,result.rows.map(presentListing));return true;
  }
  if (url.pathname === '/api/listings' && request.method === 'POST') {
    const data=await readBody(request);
    const userId=await sessionUser(request,pool);
    if(!userId || userId!==data.authorId){sendJson(response,401,{error:'Please sign in again before creating a listing.'});return true;}
    if (!data.authorId || typeof data.content!=='string' || !data.content.trim() || data.content.length>5000) {
      sendJson(response,400,{error:'Provide listing details (up to 5000 characters).'});return true;
    }
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const author=(await client.query('SELECT * FROM profiles WHERE id=$1 FOR UPDATE',[data.authorId])).rows[0];
      if (!author || !['coach','learner'].includes(author.role)) {await client.query('ROLLBACK');sendJson(response,400,{error:'A coach or learner account is required.'});return true;}
      let offer=null, status='active', title=data.title, price=Number(data.price || 0), expiresAt=null;
      if (author.role==='learner') {
        const count=await client.query("SELECT COUNT(*)::int AS count FROM listings WHERE author_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>NOW())",[author.id]);
        if(count.rows[0].count>=3){await client.query('ROLLBACK');sendJson(response,409,{error:'You can have up to 3 active listings. Remove one before creating another.'});return true;}
        if(typeof title!=='string'||!title.trim()||title.length>150||!Number.isFinite(price)||price<0){await client.query('ROLLBACK');sendJson(response,400,{error:'Add a title and a valid optional coaching budget.'});return true;}
      } else {
        if(data.isSpecial===true && data.customOffer) {
          const custom=data.customOffer;
          if(!['adult_individual','adult_group','junior_individual'].includes(custom.category)||!['single','pack_5','pack_10'].includes(custom.packSize)||!Number.isInteger(custom.durationMinutes)||custom.durationMinutes<5||custom.durationMinutes>480) {
            await client.query('ROLLBACK');sendJson(response,400,{error:'Choose a lesson type, package and valid duration (5–480 minutes).'});return true;
          }
          offer={category:custom.category,packSize:custom.packSize,durationMinutes:custom.durationMinutes};
        } else offer=author.rates_structure?.offerings?.find(o=>o.category===data.category && o.packSize===data.packSize);
        if(!offer?.durationMinutes){await client.query('ROLLBACK');sendJson(response,400,{error:'Select one configured package with a lesson duration.'});return true;}
        title=offer.category.replaceAll('_',' · ')+' · '+offer.packSize.replaceAll('_',' ');
        price=offer.formattedRate?Number(offer.formattedRate.replace(/[^0-9.]/g,'')):Infinity;
        status='active';
      }
      try {
        const terms=offerTerms({...data,isSpecial:author.role==='coach' && data.isSpecial===true},price);
        expiresAt=terms.expiresAt;
        if(terms.specialPrice!==null) {
          offer={...offer,isSpecial:true,regularFormattedRate:offer.formattedRate,formattedRate:`R ${terms.specialPrice.toFixed(2)}`};
          price=terms.specialPrice;
        }
      } catch(error) {await client.query('ROLLBACK');sendJson(response,400,{error:error.message});return true;}
      const id=randomUUID();
      const tokenCost=author.role==='coach'?listingTokenCost(author.paid_listing_count):0;
      if(tokenCost) {
        if(data.expectedTokenCost!==tokenCost){await client.query('ROLLBACK');sendJson(response,409,{error:`The publishing cost is now ${tokenCost} tokens. Review the updated price before publishing.`});return true;}
        if(author.token_balance<tokenCost){await client.query('ROLLBACK');sendJson(response,402,{error:`This listing costs ${tokenCost} tokens. Purchase tokens to publish.`,requiredTokens:tokenCost,balance:author.token_balance});return true;}
        await client.query('UPDATE profiles SET token_balance=token_balance-$1,paid_listing_count=paid_listing_count+1 WHERE id=$2',[tokenCost,author.id]);
      }
      await client.query('INSERT INTO listings (id,author_id,title,content,price,status,offer,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[id,author.id,title.trim(),data.content.trim(),price,status,offer?JSON.stringify(offer):null,expiresAt]);
      if(tokenCost) {
        await client.query('UPDATE listings SET tokens_spent=$1 WHERE id=$2',[tokenCost,id]);
        await client.query('INSERT INTO token_transactions (id,user_id,amount,listing_id) VALUES ($1,$2,$3,$4)',[randomUUID(),author.id,-tokenCost,id]);
      }
      const result=await client.query(`${select} WHERE l.id=$1`,[id]);
      await client.query('COMMIT');sendJson(response,201,presentListing(result.rows[0]));return true;
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  }
  const match=url.pathname.match(/^\/api\/listings\/([^/]+)$/);
  if(match&&request.method==='DELETE') {
    const {userId}=await readBody(request);
    if(!userId){sendJson(response,400,{error:'An account is required.'});return true;}
    const result=await pool.query("UPDATE listings SET status='archived' WHERE id=$1 AND author_id=$2 RETURNING id",[match[1],userId]);
    sendJson(response,result.rowCount?200:404,result.rowCount?{deleted:true}:{error:'Listing unavailable.'});return true;
  }
  return false;
}
