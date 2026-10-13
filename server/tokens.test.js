import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenBundles, listingTokenCost, handleTokens, validTokenAmount } from './tokens.js';

test('tokens cost R5 each and listing fees are 10 then 20',()=>{
  assert.equal(listingTokenCost(0),10);
  assert.equal(listingTokenCost(1),20);
  assert.equal(listingTokenCost(100),20);
  assert.deepEqual(tokenBundles.map(bundle=>bundle.priceCents),[5000,10000,25000,50000]);
});
test('custom purchases accept positive whole tokens',()=>{
  assert.equal(validTokenAmount(37),true);
  for(const amount of [0,-1,1.5,'20',Infinity,Number.MAX_SAFE_INTEGER])assert.equal(validTokenAmount(amount),false);
});
test('unconfigured checkout never credits unpaid tokens',async()=>{
  let response;
  const pool={query:async(sql)=>{
    if(sql.includes('account_sessions'))return {rows:[{user_id:'coach'}]};
    assert.match(sql,/SELECT role,token_balance,paid_listing_count/);
    return {rows:[{role:'coach',token_balance:0,paid_listing_count:0}]};
  }};
  await handleTokens({method:'POST',headers:{authorization:'Bearer test'}},{},new URL('http://localhost/api/tokens/checkout'),pool,async()=>({tokens:20}),(_res,status,data)=>{response={status,data};});
  assert.equal(response.status,503);
});
test('wallet requires a signed in session',async()=>{
  let status;
  await handleTokens({method:'GET',headers:{}},{},new URL('http://localhost/api/tokens'),{},null,(_res,code)=>{status=code;});
  assert.equal(status,401);
});
