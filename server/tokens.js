import { createHash } from 'node:crypto';

export const tokenSchema = `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS token_balance INTEGER NOT NULL DEFAULT 0 CHECK(token_balance>=0);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS paid_listing_count INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS token_transactions (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES profiles(id), amount INTEGER NOT NULL,
 listing_id UUID REFERENCES listings(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS tokens_spent INTEGER NOT NULL DEFAULT 0;`;

export const listingTokenCost = count => count === 0 ? 10 : 20;
export const tokenBundles = [10,20,50,100].map(tokens=>({tokens,priceCents:tokens*500}));
export const validTokenAmount = tokens => Number.isSafeInteger(tokens) && tokens > 0 && Number.isSafeInteger(tokens*500);

export async function sessionUser(request,pool) {
  const token=request.headers?.authorization?.match(/^Bearer (.+)$/)?.[1];
  if(!token)return null;
  return (await pool.query('SELECT user_id FROM account_sessions WHERE token_hash=$1 AND expires_at>NOW()',
    [createHash('sha256').update(token).digest('hex')])).rows[0]?.user_id || null;
}

export async function sessionProfile(request, pool) {
  const token = request.headers?.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  return (await pool.query(`SELECT p.* FROM account_sessions s
    JOIN profiles p ON p.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [createHash('sha256').update(token).digest('hex')])).rows[0] || null;
}

export async function handleTokens(request,response,url,pool,readBody,sendJson) {
  if(!['/api/tokens','/api/tokens/checkout'].includes(url.pathname))return false;
  const userId=await sessionUser(request,pool);
  if(!userId){sendJson(response,401,{error:'Please sign in again to access your token wallet.'});return true;}
  const profile=(await pool.query('SELECT role,token_balance,paid_listing_count FROM profiles WHERE id=$1',[userId])).rows[0];
  if(profile?.role!=='coach'){sendJson(response,403,{error:'Token wallets are for coach accounts.'});return true;}
  if(url.pathname==='/api/tokens'&&request.method==='GET') {
    sendJson(response,200,{balance:profile.token_balance,nextListingCost:listingTokenCost(profile.paid_listing_count),bundles:tokenBundles,pricePerTokenCents:500,checkoutAvailable:false});return true;
  }
  if(url.pathname==='/api/tokens/checkout'&&request.method==='POST') {
    const {tokens}=await readBody(request);
    if(!validTokenAmount(tokens)){sendJson(response,400,{error:'Enter a positive whole number of tokens.'});return true;}
    sendJson(response,503,{error:'Token purchases will be available when the booking payment gateway is connected. No payment has been taken.'});return true;
  }
  sendJson(response,405,{error:'Method unavailable.'});return true;
}
