import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccount, deleteAccount, handleAccount } from './accounts.js';
import { handleInbox } from './inbox.js';
import { sessionUser } from './tokens.js';

const fields=['new-user','New Golfer','new@example.com','password-hash','learner','Johannesburg','Bio',25,'beginner',null,null,null,'[]'];
const code='a'.repeat(32);
function registrationPool({referrer={id:'referrer',email:'friend@example.com'},duplicate=false,failLedger=false}={}) {
  const calls=[];
  const client={query:async(sql,values)=>{
    calls.push({sql,values});
    if(sql.startsWith('SELECT id,email'))return {rows:referrer?[referrer]:[]};
    if(sql.startsWith('INSERT INTO profiles'))return {rows:[{id:values[0],name:values[1],email:values[2],referral_code:'b'.repeat(32)}]};
    if(sql.startsWith('INSERT INTO referral_redemptions')){assert.match(sql,/ON CONFLICT\(email_hash\) DO NOTHING/);return {rowCount:duplicate?0:1};}
    if(sql.startsWith('INSERT INTO token_transactions')&&failLedger)throw new Error('Ledger unavailable');
    return {rows:[],rowCount:1};
  },release(){calls.push({sql:'RELEASE'});}};
  return {calls,connect:async()=>client};
}

test('signup stores the email, optional marketing choice and welcome job in the account transaction',async()=>{
  const pool=registrationPool();
  const result=await createAccount(pool,fields);
  assert.ok(result.sessionToken);
  assert.equal(result.referralRewarded,false);
  assert.deepEqual(pool.calls.find(call=>call.sql.startsWith('INSERT INTO email_contacts')).values,['new-user','new@example.com',false]);
  assert.match(pool.calls.find(call=>call.sql.startsWith('INSERT INTO email_outbox')).sql,/'welcome'/);
  assert.equal(pool.calls.at(-2).sql,'COMMIT');
  assert.equal(pool.calls.some(call=>call.sql.startsWith('UPDATE profiles SET token_balance')),false);
});

test('a new referral credits 10 and 5 tokens exactly once, together with ledger entries',async()=>{
  const pool=registrationPool();
  const result=await createAccount(pool,fields,{referralCode:code,marketingEmails:true});
  assert.equal(result.referralRewarded,true);
  const rewardCalls=pool.calls.filter(call=>call.sql.startsWith('UPDATE profiles SET token_balance'));
  assert.equal(rewardCalls.length,2);
  assert.match(rewardCalls[0].sql,/token_balance\+10/);
  assert.deepEqual(rewardCalls[0].values,['referrer']);
  assert.match(rewardCalls[1].sql,/token_balance\+5/);
  assert.deepEqual(rewardCalls[1].values,['new-user']);
  assert.ok(pool.calls.some(call=>call.sql.startsWith('INSERT INTO token_transactions')));
  assert.equal(pool.calls.find(call=>call.sql.startsWith('INSERT INTO email_contacts')).values[2],true);
  const redemption=pool.calls.find(call=>call.sql.startsWith('INSERT INTO referral_redemptions'));
  assert.equal(redemption.values[0].length,64);
  assert.notEqual(redemption.values[0],fields[2]);
});

test('recreating a previously referred email cannot earn a second reward',async()=>{
  const pool=registrationPool({duplicate:true});
  const result=await createAccount(pool,fields,{referralCode:code});
  assert.equal(result.referralRewarded,false);
  assert.equal(pool.calls.some(call=>call.sql.startsWith('UPDATE profiles SET token_balance')),false);
});

test('invalid, unavailable and self referrals never create or reward an account',async()=>{
  await assert.rejects(createAccount({connect:()=>assert.fail('Do not connect for malformed codes')},fields,{referralCode:'bad'}),/invalid/);
  for(const referrer of [null,{id:'self',email:fields[2].toUpperCase()}]) {
    const pool=registrationPool({referrer});
    await assert.rejects(createAccount(pool,fields,{referralCode:code}));
    assert.ok(pool.calls.some(call=>call.sql==='ROLLBACK'));
    assert.equal(pool.calls.some(call=>call.sql.startsWith('INSERT INTO profiles')),false);
  }
});

test('reward failures roll back signup, both balances and the welcome email',async()=>{
  const pool=registrationPool({failLedger:true});
  await assert.rejects(createAccount(pool,fields,{referralCode:code}),/Ledger unavailable/);
  assert.ok(pool.calls.some(call=>call.sql==='ROLLBACK'));
  assert.equal(pool.calls.some(call=>call.sql==='COMMIT'),false);
});

test('deletion revokes sessions, removes email data, anonymizes the profile and preserves shared booking records',async()=>{
  const calls=[];
  const client={query:async(sql,values)=>{calls.push({sql,values});return {rows:sql.startsWith('SELECT id')?[{id:'owner'}]:[],rowCount:1};},release(){}};
  await deleteAccount({connect:async()=>client},'owner','Taking a break');
  for(const table of ['account_sessions','email_outbox','email_contacts','notification_reads'])assert.ok(calls.some(call=>call.sql===`DELETE FROM ${table} WHERE user_id=$1`));
  const audit=calls.find(call=>call.sql.startsWith('INSERT INTO account_deletions'));
  assert.equal(audit.values[1],'Taking a break');
  assert.equal(audit.values.includes('owner'),false);
  const profile=calls.find(call=>call.sql.startsWith('UPDATE profiles'));
  assert.match(profile.sql,/deleted_at=NOW\(\)/);
  assert.match(profile.sql,/profile_image=NULL/);
  assert.match(profile.sql,/referral_code=NULL/);
  assert.match(profile.values[1],/@deleted\.invalid$/);
  assert.ok(calls.some(call=>call.sql.startsWith('UPDATE bookings')));
  assert.equal(calls.some(call=>call.sql.startsWith('DELETE FROM bookings')),false);
  assert.equal(calls.at(-1).sql,'COMMIT');
});

test('account deletion requires both confirmation and a nonblank reason',async()=>{
  for(const body of [{confirmed:false,reason:'Leaving'},{confirmed:true,reason:'  '},{confirmed:true,reason:'x'.repeat(2001)}]) {
    let status;
    await handleAccount({method:'DELETE',headers:{authorization:'Bearer valid'}},{},new URL('http://localhost/api/account'),{query:async()=>({rows:[{user_id:'owner'}]}),connect:()=>assert.fail('Unconfirmed deletion must not run')},async()=>body,(_res,code)=>{status=code;});
    assert.equal(status,400);
  }
});

test('email unsubscribe only changes the marketing subscription',async()=>{
  let response;
  const token='01234567-0123-4123-8123-012345678901';
  await handleAccount({method:'POST'},{},new URL('http://localhost/api/email/unsubscribe'),{query:async(sql,values)=>{
    assert.match(sql,/UPDATE email_contacts SET marketing_subscribed=FALSE/);
    assert.deepEqual(values,[token]);return {rowCount:1};
  }},async()=>({token}),(_res,status,body)=>{response={status,body};});
  assert.equal(response.status,200);
  assert.equal(response.body.unsubscribed,true);
});

test('failed account cleanup rolls back rather than leaving a partially deleted account',async()=>{
  const calls=[];
  await assert.rejects(deleteAccount({connect:async()=>({query:async sql=>{
    calls.push(sql);
    if(sql.startsWith('SELECT id'))return {rows:[{id:'owner'}]};
    if(sql.startsWith('UPDATE messages'))throw new Error('Cleanup unavailable');
    return {};
  },release(){}})},'owner','Leaving'),/Cleanup unavailable/);
  assert.equal(calls.at(-1),'ROLLBACK');
  assert.equal(calls.includes('COMMIT'),false);
});

test('session validation excludes deleted profiles even if a stale session is presented',async()=>{
  assert.equal(await sessionUser({headers:{authorization:'Bearer stale'}},{query:async sql=>{
    assert.match(sql,/p.deleted_at IS NULL/);return {rows:[]};
  }}),null);
});

test('new conversations and messages require both participants to have active accounts',async()=>{
  for(const path of ['/api/conversations','/api/conversations/room/messages']) {
    let status;
    await handleInbox({method:'POST'},{},new URL(`http://localhost${path}`),{query:async sql=>{
      assert.match(sql,/a.deleted_at IS NULL AND b.deleted_at IS NULL/);return {rowCount:0,rows:[]};
    }},async()=>({userId:'owner',participantId:'deleted',text:'Hello'}),(_res,code)=>{status=code;});
    assert.ok([403,410].includes(status));
  }
});
