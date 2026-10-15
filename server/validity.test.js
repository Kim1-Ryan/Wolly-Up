import test from 'node:test';
import assert from 'node:assert/strict';
import { packageWindow, dateInWindow, validPackageWindow, validityMonths } from '../src/packages.js';
import { handleBookings } from './bookings.js';

test('validity choices restrict a year to 10-lesson packages and preserve legacy defaults',()=>{
  assert.equal(validityMonths({packSize:'pack_5'}),3);
  for (const packSize of ['single','pack_5','pack_10']) {
    for (const months of [1,3,6]) assert.ok(validPackageWindow({packSize,validityMonths:months}));
    assert.equal(validPackageWindow({packSize,validityMonths:12}),packSize==='pack_10');
  }
  for (const months of [0,2,4,24,'3']) assert.equal(validPackageWindow({packSize:'pack_10',validityMonths:months}),false);
  assert.equal(validPackageWindow({packSize:'invalid'}),false);
});

test('calendar-month windows clamp month ends, include the last date and handle leap years',()=>{
  assert.deepEqual(packageWindow('2099-01-31',1),{start:'2099-01-31',end:'2099-02-28'});
  assert.equal(packageWindow('2028-01-31',1).end,'2028-02-29');
  assert.equal(packageWindow('2028-02-29',12).end,'2029-02-28');
  const window=packageWindow('2099-10-31',3);
  assert.equal(window.end,'2100-01-31');
  assert.ok(dateInWindow(window.end,window));
  assert.equal(dateInWindow('2100-02-01',window),false);
  assert.equal(dateInWindow('2099-10-30',window),false);
  assert.equal(packageWindow('2099-02-30',3),null);
  assert.equal(dateInWindow('2099-02-30',packageWindow('2099-01-01',3)),false);
});

async function book(overrides={}) {
  let inserted, response;
  const offer={category:'junior_individual',packSize:'pack_5',durationMinutes:60,validityMonths:1,formattedRate:'R 900'};
  const data={learnerId:'learner',coachId:'coach',category:offer.category,packSize:offer.packSize,package:'junior individual (5 lessons)',rate:'R 1',validityMonths:12,sessions:['2099-01-31','2099-02-01','2099-02-10','2099-02-15','2099-02-28'].map(date=>({date,time:'10:00'})),...overrides};
  const pool={query:async(sql,values)=>{
    if(sql.startsWith('SELECT id, role'))return {rows:[{id:'learner',role:'learner'},{id:'coach',role:'coach',rates_structure:{offerings:[offer]}}]};
    if(sql.startsWith('INSERT INTO bookings')){inserted=JSON.parse(values[3]);return {};}
    return {rows:[{id:'booking',details:inserted}]};
  }};
  await handleBookings({method:'POST'},{},new URL('http://localhost/api/bookings'),pool,async()=>data,(_res,status,body)=>{response={status,body};});
  return {response,inserted,data};
}

test('booking saves coach-defined validity and price rather than learner-supplied values',async()=>{
  const {response,inserted}=await book();
  assert.equal(response.status,201);
  assert.equal(inserted.validityMonths,1);
  assert.equal(inserted.validityStart,'2099-01-31');
  assert.equal(inserted.validityEnd,'2099-02-28');
  assert.equal(inserted.rate,'R 900');
});

test('API rejects dates outside the window, wrong lesson counts and forged starts',async()=>{
  const {data}=await book();
  for(const overrides of [
    {sessions:data.sessions.map((session,index)=>index===4?{...session,date:'2099-03-01'}:session)},
    {sessions:data.sessions.slice(0,4)},
    {validityStart:'2099-02-15'},
    {sessions:data.sessions.map(()=>data.sessions[0])},
  ]) {
    const {response,inserted}=await book(overrides);
    assert.equal(response.status,400);
    assert.equal(inserted,undefined);
  }
});

test('rescheduling cannot move lessons outside the saved validity period',async()=>{
  let response;
  const details={durationMinutes:60,validityMonths:1,validityStart:'2099-01-31',sessions:[{date:'2099-02-10',time:'10:00'}]};
  await handleBookings({method:'POST'},{},new URL('http://localhost/api/bookings/booking/change-request'),{query:async sql=>{
    assert.ok(sql.startsWith('SELECT details'),'No invalid change may be saved');
    return {rows:[{details}]};
  }},async()=>({userId:'learner',action:'request',kind:'edit',reason:'New date',sessions:[{date:'2099-03-01',time:'10:00'}]}),(_res,status,body)=>{response={status,body};});
  assert.equal(response.status,400);
  assert.match(response.body.error,/28 Feb 2099/);
});
