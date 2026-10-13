import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleBookings, repairLegacyBookingDurations } from './bookings.js';

test('declining requires a nonblank reason before updating the booking', async () => {
  for (const reason of [undefined, '', '   ', 'x'.repeat(2001)]) {
    let status;
    await handleBookings({method:'PATCH'}, {}, new URL('http://localhost/api/bookings/booking'),
      {query: async()=>assert.fail('Invalid declines must not update bookings')},
      async()=>({userId:'coach',action:'reject',reason}), (_res, code)=>{status=code;});
    assert.equal(status,400);
  }
});

test('decline reason is persisted and returned with the booking', async () => {
  let response;
  const pool={async query(sql,values) {
    if(sql.startsWith('UPDATE bookings')) {
      assert.match(sql,/coach_id = \$3 AND status = \$4/);
      assert.match(sql,/jsonb_build_object\('declineReason',\$5::text\)/);
      assert.deepEqual(values,['declined_by_coach','booking','coach','pending_coach_approval','Unavailable that day']);
      return {rowCount:1};
    }
    return {rows:[{id:'booking',status:'declined_by_coach',details:{declineReason:'Unavailable that day'}}]};
  }};
  await handleBookings({method:'PATCH'}, {}, new URL('http://localhost/api/bookings/booking'),pool,
    async()=>({userId:'coach',action:'reject',reason:'  Unavailable that day  '}),(_res,status,data)=>{response={status,data};});
  assert.equal(response.status,200);
  assert.equal(response.data.declineReason,'Unavailable that day');
});

test('shared coach availability returns only confirmed dates without participant details', async () => {
  const pool = { async query(sql, values) {
    assert.deepEqual(values, ['coach']);
    assert.match(sql, /SELECT DISTINCT s->>'date' AS date/);
    assert.match(sql, /b\.coach_id=\$1 AND b\.status='booking_confirmed_and_paid'/);
    return { rows: [{ date: '2026-10-14' }, { date: '2026-10-16' }] };
  } };
  let response;
  const handled = await handleBookings({ method: 'GET' }, {}, new URL('http://localhost/api/coaches/coach/availability'), pool, null,
    (_res, status, data) => { response = { status, data }; });
  assert.equal(handled, true);
  assert.deepEqual(response, { status: 200, data: ['2026-10-14', '2026-10-16'] });
});

test('repairs legacy bookings using their matching package, including midnight rollover', async () => {
  const details = { package: 'adult individual (single)', sessions: [{ date: '2026-10-12', time: '23:30' }] };
  let repaired;
  const pool = { async query(sql, values) {
    if (sql.includes('SELECT DISTINCT')) return { rows: repaired ? [] : [{ id: 'coach', rates_structure: { offerings: [
      { category: 'adult_individual', packSize: 'single', durationMinutes: 60 }
    ] } }] };
    if (sql.startsWith('SELECT id,details')) return { rows: [{ id: 'booking', details }] };
    assert.equal(values[1], 'booking');
    repaired = JSON.parse(values[0]);
    return { rowCount: 1 };
  } };
  await repairLegacyBookingDurations(pool);
  assert.deepEqual(repaired, { ...details, durationMinutes: 60, sessions: [
    { date: '2026-10-12', time: '23:30', endDate: '2026-10-13', endTime: '00:30' }
  ] });
  await repairLegacyBookingDurations(pool);
});

test('does not guess a duration when the coach has no matching offering', async () => {
  const pool = { async query(sql) {
    if (sql.includes('SELECT DISTINCT')) return { rows: [{ id: 'coach', rates_structure: null }] };
    assert.ok(sql.startsWith('SELECT id,details'));
    return { rows: [{ id: 'booking', details: { package: 'unknown', sessions: [{ date: '2026-10-12', time: '16:15' }] } }] };
  } };
  await repairLegacyBookingDurations(pool);
});
