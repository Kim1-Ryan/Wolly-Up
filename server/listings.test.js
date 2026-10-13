import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleListings, offerTerms } from './listings.js';

async function create(role, count, data={}, balance=100, published=0) {
  let inserted; const charges=[];
  const offer={category:'adult_individual',packSize:'single',durationMinutes:60,formattedRate:'R 250.00'};
  const client={async query(sql,values) {
    if(sql.startsWith('SELECT * FROM profiles')) {assert.match(sql,/FOR UPDATE/);return {rows:[{id:'author',role,token_balance:balance,paid_listing_count:published,rates_structure:{offerings:[offer]}}]};}
    if(sql.includes('COUNT(*)')) return {rows:[{count}]};
    if(sql.startsWith('UPDATE profiles SET token_balance')) {charges.push(values[0]);return {};}
    if(sql.startsWith('INSERT INTO listings')) {inserted=values;return {};}
    if(sql.startsWith('SELECT l.')) return {rows:[{id:inserted[0],price:inserted[4],status:inserted[5],offer:inserted[6]?JSON.parse(inserted[6]):null}]};
    return {};
  },release(){}};
  let response;
  await handleListings({method:'POST',headers:{authorization:'Bearer test'}}, {}, new URL('http://localhost/api/listings'),{connect:async()=>client,query:async()=>({rows:[{user_id:'author'}]})},async()=>({authorId:'author',expectedTokenCost:10,title:'Seeking coaching',content:'Beginner seeking a coach',...data}),(_res,status,body)=>{response={status,body};});
  return {response,inserted,offer,charges};
}

test('learner posting is free, with an optional budget',async()=>{
  const {response,inserted}=await create('learner',2);
  assert.equal(response.status,201);
  assert.equal(inserted[4],0);
  assert.equal(inserted[5],'active');
});
test('learner fourth active listing is rejected',async()=>{
  const {response,inserted}=await create('learner',3);
  assert.equal(response.status,409);
  assert.equal(inserted,undefined);
});

test('first paid listing costs 10 tokens and later ones cost 20',async()=>{
  const offer={category:'adult_individual',packSize:'single'};
  const first=await create('coach',0,offer,100,0);
  assert.deepEqual(first.charges,[10]);
  const later=await create('coach',0,{...offer,expectedTokenCost:20},100,1);
  assert.deepEqual(later.charges,[20]);
});

test('insufficient balance and changed quotes never publish or charge',async()=>{
  const offer={category:'adult_individual',packSize:'single'};
  const insufficient=await create('coach',0,offer,9,0);
  assert.equal(insufficient.response.status,402);
  assert.equal(insufficient.inserted,undefined);
  assert.deepEqual(insufficient.charges,[]);
  const stale=await create('coach',0,offer,100,1);
  assert.equal(stale.response.status,409);
  assert.deepEqual(stale.charges,[]);
});
test('coach offer uses the saved package and cannot bypass the publishing fee',async()=>{
  const {response,inserted,offer}=await create('coach',0,{category:'adult_individual',packSize:'single',price:1,status:'active'});
  assert.equal(response.status,201);
  assert.equal(inserted[4],250);
  assert.equal(inserted[5],'active');
  assert.deepEqual(JSON.parse(inserted[6]),offer);
});
test('coach must choose an existing single offer',async()=>{
  const {response,inserted}=await create('coach',0,{category:'unknown',packSize:'single'});
  assert.equal(response.status,400);
  assert.equal(inserted,undefined);
});
test('feed query includes active listings and only the current author’s pending offers',async()=>{
  let response;
  await handleListings({method:'GET'}, {},new URL('http://localhost/api/listings?userId=author'),{query:async(sql,values)=>{
    if(sql.startsWith('UPDATE listings')) {assert.match(sql,/expires_at<=NOW\(\)/);return {};}
    assert.match(sql,/l.status='active' OR l.author_id=\$1/);assert.deepEqual(values,['author']);return {rows:[]};
  }},null,(_res,status)=>{response=status;});
  assert.equal(response,200);
});

test('special pricing requires a discount and future expiry',()=>{
  const now=Date.parse('2026-10-13T12:00:00Z');
  const expiresAt='2026-10-20T18:00:00+02:00';
  assert.deepEqual(offerTerms({isSpecial:true,specialPrice:200,expiresAt},250,now),{specialPrice:200,expiresAt:'2026-10-20T16:00:00.000Z'});
  for(const data of [{isSpecial:true,specialPrice:200},{isSpecial:true,specialPrice:250,expiresAt},{isSpecial:true,specialPrice:0,expiresAt},{isSpecial:true,specialPrice:200,expiresAt:'invalid'},{isSpecial:true,specialPrice:200,expiresAt:'2026-10-12T12:00:00Z'}]) {
    assert.throws(()=>offerTerms(data,250,now));
  }
});

test('ordinary listings never receive an expiry',()=>{
  assert.deepEqual(offerTerms({expiresAt:'2026-11-01T12:00:00Z'},250,0),{expiresAt:null,specialPrice:null});
});

test('removing a listing archives it for its owner instead of deleting history',async()=>{
  let status;
  await handleListings({method:'DELETE'}, {},new URL('http://localhost/api/listings/listing'),{query:async(sql,values)=>{
    assert.match(sql,/UPDATE listings SET status='archived'/);
    assert.deepEqual(values,['listing','owner']);return {rowCount:1};
  }},async()=>({userId:'owner'}),(_res,code)=>{status=code;});
  assert.equal(status,200);
});
