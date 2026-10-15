import { randomUUID } from "node:crypto";
import { lessonCount, validityMonths, validPackageWindow, packageWindow, dateInWindow, windowMessage } from '../src/packages.js';

function timedSessions(sessions, durationMinutes) {
  return sessions.map(s => {
    const end = new Date(Date.parse(`${s.date}T${s.time}:00+02:00`) + durationMinutes*60000 + 2*3600000).toISOString();
    return {date:s.date,time:s.time,endDate:end.slice(0,10),endTime:end.slice(11,16)};
  });
}

export async function confirmMissingDurations(pool, coachId, offerings) {
  const result=await pool.query("SELECT id,details FROM bookings WHERE coach_id=$1 AND NOT(details ? 'durationMinutes')",[coachId]);
  for(const booking of result.rows) {
    const offer=offerings.find(o=>`${o.category.replaceAll('_',' ')} (${o.packSize.replaceAll('_',' ')})`===booking.details.package);
    if(offer?.durationMinutes && booking.details.sessions?.length) {
      await pool.query("UPDATE bookings SET details=$1 WHERE id=$2 AND NOT(details ? 'durationMinutes')",[JSON.stringify({...booking.details,durationMinutes:offer.durationMinutes,sessions:timedSessions(booking.details.sessions,offer.durationMinutes)}),booking.id]);
    }
  }
}

// Older bookings predate saved lesson end times. Recover them from the
// coach's matching package without inventing a duration.
export async function repairLegacyBookingDurations(pool) {
  const coaches = await pool.query(`SELECT DISTINCT p.id, p.rates_structure
    FROM profiles p JOIN bookings b ON b.coach_id=p.id
    WHERE NOT(b.details ? 'durationMinutes')`);
  for (const coach of coaches.rows) {
    await confirmMissingDurations(pool, coach.id, coach.rates_structure?.offerings || []);
  }
}

export const bookingSchema = `CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES profiles(id),
  coach_id UUID NOT NULL REFERENCES profiles(id),
  details JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_coach_approval',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS change_request JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS change_log JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS lesson_feedback (
 booking_id UUID NOT NULL REFERENCES bookings(id), user_id UUID NOT NULL REFERENCES profiles(id),
 slot TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(booking_id,user_id,slot)
)`;

function present(row) {
  return { ...row.details, id: row.id, learnerId: row.learner_id,
    coachId: row.coach_id, learnerName: row.learner_name,
    coachName: row.coach_name, status: row.status, venueLog: row.venue_log || [], changeRequest: row.change_request, changeLog: row.change_log || [], feedback: row.feedback || [] };
}

const select = `SELECT b.*, l.name AS learner_name, c.name AS coach_name,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',f.user_id,'slot',f.slot,'rating',f.rating,'comment',f.comment,'createdAt',f.created_at)) FROM lesson_feedback f WHERE f.booking_id=b.id),'[]'::jsonb) AS feedback,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'location',v.location,'acceptedBy',p.name,'createdAt',v.created_at) ORDER BY v.created_at DESC)
    FROM booking_venue_log v JOIN profiles p ON p.id=v.accepted_by WHERE v.booking_id=b.id), '[]'::jsonb) AS venue_log
  FROM bookings b JOIN profiles l ON l.id = b.learner_id
  JOIN profiles c ON c.id = b.coach_id`;

export async function handleBookings(request, response, url, pool, readBody, sendJson) {
  const availabilityMatch = url.pathname.match(/^\/api\/coaches\/([^/]+)\/availability$/);
  if (availabilityMatch && request.method === 'GET') {
    const result = await pool.query(`SELECT DISTINCT s->>'date' AS date
      FROM bookings b CROSS JOIN LATERAL jsonb_array_elements(b.details->'sessions') s
      WHERE b.coach_id=$1 AND b.status='booking_confirmed_and_paid'
      ORDER BY date`, [availabilityMatch[1]]);
    sendJson(response, 200, result.rows.map(row => row.date));
    return true;
  }
  const feedbackMatch=url.pathname.match(/^\/api\/bookings\/([^/]+)\/feedback$/);
  if(feedbackMatch && request.method==='POST') {
    const {userId,slot,rating,comment,completed}=await readBody(request);
    if(!userId || typeof slot!=='string' || completed!==true || !Number.isInteger(rating) || rating<1 || rating>5 || (comment!==undefined && (typeof comment!=='string' || comment.length>2000))) {
      sendJson(response,400,{error:"Confirm lesson completion and choose a rating from 1 to 5."});return true;
    }
    const saved=await pool.query(`INSERT INTO lesson_feedback (booking_id,user_id,slot,rating,comment)
      SELECT b.id,$2,$3,$4,$5 FROM bookings b WHERE b.id=$1 AND (learner_id=$2 OR coach_id=$2)
      AND status='booking_confirmed_and_paid' AND EXISTS (SELECT 1 FROM jsonb_array_elements(b.details->'sessions') s
        WHERE (s->>'date')||'T'||(s->>'time')=$3 AND ((COALESCE(s->>'endDate',s->>'date')||'T'||(s->>'endTime'))::timestamp AT TIME ZONE 'Africa/Johannesburg')<=NOW())
      ON CONFLICT DO NOTHING RETURNING booking_id`,[feedbackMatch[1],userId,slot,rating,comment?.trim() || '']);
    if(!saved.rowCount){sendJson(response,409,{error:"This lesson has not passed, was already reviewed, or is unavailable."});return true;}
    sendJson(response,200,present((await pool.query(`${select} WHERE b.id=$1`,[feedbackMatch[1]])).rows[0]));return true;
  }
  const changeMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\/change-request$/);
  if (changeMatch && request.method === "POST") {
    const {userId, action, kind, reason, sessions} = await readBody(request);
    let result;
    if (action === "request") {
      if (kind === 'edit' && Array.isArray(sessions)) {
        const invalid = sessions.findIndex(s => !s.date || !s.time || !Number.isFinite(Date.parse(`${s.date}T${s.time}`)) || Date.parse(`${s.date}T${s.time}`)<=Date.now());
        if (invalid>=0) { sendJson(response,400,{error:`Lesson ${invalid+1}: choose a date and time in the future.`});return true; }
      }
      if (!userId || !['edit','cancel'].includes(kind) || typeof reason !== 'string' || !reason.trim() || reason.length > 2000 ||
        (kind === 'edit' && (!Array.isArray(sessions) || !sessions.length || sessions.some(s => !s.date || !s.time || !Number.isFinite(Date.parse(`${s.date}T${s.time}`)) || Date.parse(`${s.date}T${s.time}`) <= Date.now())))) {
        sendJson(response,400,{error:"Provide a reason and valid future lesson dates for an alteration."});return true;
      }
      const current=(await pool.query("SELECT details FROM bookings WHERE id=$1 AND (learner_id=$2 OR coach_id=$2)",[changeMatch[1],userId])).rows[0];
      const duration=current?.details.durationMinutes;
      if(kind==='edit'&&!duration){sendJson(response,400,{error:"Confirm the package lesson duration before rescheduling this booking."});return true;}
      if (kind === 'edit') {
        const start = current.details.validityStart || current.details.sessions?.map(session=>session.date).sort()[0];
        const window = packageWindow(start, current.details.validityMonths ?? 3);
        if (!window || sessions.some(session=>!dateInWindow(session.date, window))) {
          sendJson(response,400,{error:window ? windowMessage(window) : 'The package validity period is unavailable. Please contact your coach.'});return true;
        }
      }
      const proposal = {id:randomUUID(),requestedBy:userId,kind,reason:reason.trim(),sessions:kind==='edit'?timedSessions(sessions,duration):[],createdAt:new Date().toISOString()};
      result = await pool.query(`UPDATE bookings SET change_request=$1 WHERE id=$2 AND (learner_id=$3 OR coach_id=$3)
        AND status IN ('pending_coach_approval','awaiting_immediate_payment','booking_confirmed_and_paid') AND change_request IS NULL
        AND ($4='cancel' OR jsonb_array_length(details->'sessions')=$5) RETURNING id`,
        [JSON.stringify(proposal),changeMatch[1],userId,kind,sessions?.length || 0]);
    } else if (['accept','decline'].includes(action) && userId) {
      result = await pool.query(`UPDATE bookings SET
        status=CASE WHEN $1='accept' AND change_request->>'kind'='cancel' THEN 'cancelled' ELSE status END,
        details=CASE WHEN $1='accept' AND change_request->>'kind'='edit' THEN jsonb_set(details,'{sessions}',change_request->'sessions') ELSE details END,
        change_log=change_log || jsonb_build_array(change_request || jsonb_build_object('decision',$1,'respondedBy',$2::text,'respondedAt',NOW())),
        change_request=NULL
        WHERE id=$3 AND (learner_id=$2 OR coach_id=$2) AND change_request IS NOT NULL AND change_request->>'requestedBy'<>$2::text
          AND status IN ('pending_coach_approval','awaiting_immediate_payment','booking_confirmed_and_paid') RETURNING id`,[action,userId,changeMatch[1]]);
    } else { sendJson(response,400,{error:"Invalid booking request action."});return true; }
    if (!result.rowCount) {sendJson(response,409,{error:"Booking unavailable, lesson count changed, or a request is already pending or answered."});return true;}
    const updated=await pool.query(`${select} WHERE b.id=$1`,[changeMatch[1]]);
    sendJson(response,200,present(updated.rows[0]));return true;
  }
  if (url.pathname === "/api/bookings" && request.method === "GET") {
    const userId = url.searchParams.get("userId");
    if (!userId) { sendJson(response, 400, { error: "An account is required." }); return true; }
    const result = await pool.query(`${select} WHERE b.learner_id = $1 OR b.coach_id = $1 ORDER BY b.created_at DESC`, [userId]);
    sendJson(response, 200, result.rows.map(present));
    return true;
  }
  if (url.pathname === "/api/bookings" && request.method === "POST") {
    const data = await readBody(request);
    if (!data.learnerId || !data.coachId || !data.package || !data.rate ||
      !Array.isArray(data.sessions) || !data.sessions.length || data.sessions.some(s =>
        !s.date || !s.time || !Number.isFinite(Date.parse(`${s.date}T${s.time}`)) || Date.parse(`${s.date}T${s.time}`) <= Date.now())) {
      sendJson(response, 400, { error: "Select a package and valid future lesson times." }); return true;
    }
    const profiles = await pool.query("SELECT id, role, rates_structure FROM profiles WHERE (id = $1 OR id = $2) AND deleted_at IS NULL", [data.learnerId, data.coachId]);
    if (!profiles.rows.some(p => p.id === data.learnerId && p.role === "learner") ||
      !profiles.rows.some(p => p.id === data.coachId && p.role === "coach")) {
      sendJson(response, 400, { error: "A learner and coach account are required." }); return true;
    }
    const id = randomUUID();
    const offer=profiles.rows.find(p=>p.id===data.coachId)?.rates_structure?.offerings?.find(o=>o.category===data.category&&o.packSize===data.packSize);
    if(!Number.isInteger(offer?.durationMinutes)||offer.durationMinutes<5||offer.durationMinutes>480){sendJson(response,400,{error:"The coach must confirm a lesson duration in the selected package."});return true;}
    if (!validPackageWindow(offer) || data.sessions.length !== lessonCount(offer.packSize)) {
      sendJson(response,400,{error:'Select every lesson in the package and check its validity period.'});return true;
    }
    const validityStart = data.sessions.map(session=>session.date).sort()[0];
    const window = packageWindow(validityStart, validityMonths(offer));
    if (!window || (data.validityStart && data.validityStart !== validityStart) || data.sessions.some(session=>!dateInWindow(session.date,window))) {
      sendJson(response,400,{error:window ? windowMessage(window) : 'Choose a valid first lesson date.'});return true;
    }
    if (new Set(data.sessions.map(session=>`${session.date}T${session.time}`)).size !== data.sessions.length) {
      sendJson(response,400,{error:'Choose a different date or time for each lesson.'});return true;
    }
    await pool.query("INSERT INTO bookings (id, learner_id, coach_id, details) VALUES ($1, $2, $3, $4)",
      [id, data.learnerId, data.coachId, JSON.stringify({ sessions: timedSessions(data.sessions,offer.durationMinutes), durationMinutes:offer.durationMinutes, validityMonths:validityMonths(offer), validityStart:window.start, validityEnd:window.end, package: data.package, rate: offer.formattedRate })]);
    const result = await pool.query(`${select} WHERE b.id = $1`, [id]);
    sendJson(response, 201, present(result.rows[0]));
    return true;
  }
  const match = url.pathname.match(/^\/api\/bookings\/([^/]+)$/);
  if (match && request.method === "PATCH") {
    const { userId, action, reason } = await readBody(request);
    if (action === 'reject' && (typeof reason !== 'string' || !reason.trim() || reason.length > 2000)) {
      sendJson(response, 400, { error: 'Provide a reason for declining (up to 2000 characters).' }); return true;
    }
    const transitions = {
      accept: ["coach_id", "pending_coach_approval", "awaiting_immediate_payment"],
      reject: ["coach_id", "pending_coach_approval", "declined_by_coach"],
      mock_payment: ["learner_id", "awaiting_immediate_payment", "booking_confirmed_and_paid"]
    };
    const transition = transitions[action];
    if (!userId || !transition) { sendJson(response, 400, { error: "Invalid booking action." }); return true; }
    const [owner, previous, next] = transition;
    const updated = await pool.query(`UPDATE bookings SET status = $1,
      details = CASE WHEN $1='declined_by_coach' THEN details || jsonb_build_object('declineReason',$5::text) ELSE details END,
      approved_at = CASE WHEN $1 = 'awaiting_immediate_payment' THEN NOW() ELSE approved_at END
      WHERE id = $2 AND ${owner} = $3 AND status = $4 RETURNING id`, [next, match[1], userId, previous, action==='reject'?reason.trim():null]);
    if (!updated.rowCount) { sendJson(response, 409, { error: "This booking is unavailable or has already changed. Refresh and try again." }); return true; }
    const result = await pool.query(`${select} WHERE b.id = $1`, [match[1]]);
    sendJson(response, 200, present(result.rows[0]));
    return true;
  }
  return false;
}
