import test from 'node:test';
import assert from 'node:assert/strict';
import { welcomeEmail, processEmailQueue, queueEmail } from './mail.js';

const config={EMAIL_PROVIDER:'resend',RESEND_API_KEY:'test-key',EMAIL_FROM:'Wolly Up <hello@example.com>',PUBLIC_APP_URL:'https://example.com/Wolly-Up/'};

test('welcome email explains rewards, includes the personal link and distinguishes marketing opt-outs',()=>{
  const email=welcomeEmail({name:'Alex',referral_code:'a'.repeat(32)},{unsubscribe_token:'unsubscribe-token'},{referralRewarded:true},config.PUBLIC_APP_URL);
  assert.match(email.text,/10 tokens/);
  assert.match(email.text,/5 free tokens/);
  assert.match(email.text,/https:\/\/example.com\/Wolly-Up\/\?ref=aaaaaaaa/);
  assert.match(email.text,/Your 5 referral tokens have been added/);
  assert.match(email.text,/unsubscribe=unsubscribe-token/);
  assert.match(email.text,/does not stop important emails/);
});

test('missing email configuration leaves welcome emails queued and signup independent of delivery',async()=>{
  assert.deepEqual(await processEmailQueue({query:()=>assert.fail('No jobs should be claimed without a sender')},{config:{}}),{configured:false,sent:0});
});

test('queueing marketing checks consent while account emails bypass marketing preferences',async()=>{
  const calls=[];
  const pool={query:async(sql,values)=>{calls.push({sql,values});return {};}};
  for(const kind of ['marketing','account'])await queueEmail(pool,'user',{kind,eventKey:`event-${kind}`,subject:'Subject',text:'Message'});
  assert.match(calls[0].sql,/\$3<>'marketing' OR c.marketing_subscribed/);
  assert.equal(calls[1].values[2],'account');
  assert.match(calls[1].sql,/ON CONFLICT\(event_key\) DO NOTHING/);
});

async function deliver(kind,subscribed,{fail=false,deleted=false}={}) {
  const updates=[],sent=[];
  const pool={query:async(sql,values)=>{
    if(sql.startsWith('UPDATE email_outbox SET status=\'sending\''))return {rows:[{id:'email-id',user_id:'user',kind,event_key:'unique-key',payload:{subject:'Account message',text:'Message'},attempts:1}]};
    if(sql.startsWith('SELECT p.name'))return {rows:deleted?[]:[{name:'Alex',email:'alex@example.com',referral_code:'a'.repeat(32),unsubscribe_token:'token',marketing_subscribed:subscribed}]};
    updates.push({sql,values});return {};
  }};
  const result=await processEmailQueue(pool,{config,send:async(url,options)=>{sent.push({url,options});return {ok:!fail};}});
  return {updates,sent,result};
}

test('unsubscribed members still receive welcome and essential account emails',async()=>{
  for(const kind of ['welcome','account']) {
    const {sent,result}=await deliver(kind,false);
    assert.equal(result.sent,1);
    assert.equal(sent.length,1);
    assert.equal(sent[0].options.headers['Idempotency-Key'],'unique-key');
    assert.deepEqual(JSON.parse(sent[0].options.body).to,['alex@example.com']);
  }
});

test('marketing jobs are suppressed after unsubscribe and all jobs stop for deleted accounts',async()=>{
  for(const options of [{kind:'marketing',deleted:false},{kind:'welcome',deleted:true}]) {
    const {sent,updates}=await deliver(options.kind,false,options);
    assert.equal(sent.length,0);
    assert.ok(updates.some(call=>call.sql.includes("status='suppressed'")));
  }
});

test('failed delivery returns to the retry queue without losing the job',async()=>{
  const {updates,result}=await deliver('welcome',false,{fail:true});
  assert.equal(result.sent,0);
  assert.ok(updates.some(call=>call.sql.includes("THEN 'failed' ELSE 'pending'")));
});
