import { randomUUID } from "node:crypto";

export const inboxSchema = `
CREATE TABLE IF NOT EXISTS conversations (
 id UUID PRIMARY KEY, first_id UUID NOT NULL REFERENCES profiles(id),
 second_id UUID NOT NULL REFERENCES profiles(id), UNIQUE(first_id, second_id)
);
CREATE TABLE IF NOT EXISTS messages (
 id UUID PRIMARY KEY, room_id UUID NOT NULL REFERENCES conversations(id),
 sender_id UUID NOT NULL REFERENCES profiles(id), text TEXT NOT NULL,
 location JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS venue_status TEXT;
CREATE TABLE IF NOT EXISTS booking_venue_log (
 id UUID PRIMARY KEY, booking_id UUID NOT NULL REFERENCES bookings(id),
 message_id UUID UNIQUE NOT NULL REFERENCES messages(id),
 accepted_by UUID NOT NULL REFERENCES profiles(id), location JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notification_reads (
 user_id UUID NOT NULL REFERENCES profiles(id), notification_id TEXT NOT NULL,
 PRIMARY KEY(user_id, notification_id)
);`;

async function rooms(pool, userId) {
 const result = await pool.query(`SELECT c.*, a.name AS first_name, b.name AS second_name
 FROM conversations c JOIN profiles a ON a.id=c.first_id JOIN profiles b ON b.id=c.second_id
 WHERE c.first_id=$1 OR c.second_id=$1`, [userId]);
 const messages = await pool.query(`SELECT m.*, p.name AS sender_name FROM messages m
 JOIN profiles p ON p.id=m.sender_id JOIN conversations c ON c.id=m.room_id
 WHERE c.first_id=$1 OR c.second_id=$1 ORDER BY m.created_at, m.id`, [userId]);
 return result.rows.map(r => ({ id:r.id, participants:[r.first_id,r.second_id],
   participantNames:[r.first_name,r.second_name], messages:messages.rows.filter(m=>m.room_id===r.id).map(m=>({
     id:m.id, senderId:m.sender_id, senderName:m.sender_name, text:m.text,
     location:m.location, venueStatus:m.venue_status, timestamp:m.created_at })) }));
}

export async function handleInbox(request, response, url, pool, readBody, sendJson) {
 const venueMatch=url.pathname.match(/^\/api\/messages\/([^/]+)\/venue$/);
 if(request.method === "PATCH" && venueMatch) {
   const {userId,action,bookingId}=await readBody(request);
   if(!userId || !['accept','decline'].includes(action) || (action==='accept'&&!bookingId)) {
     sendJson(response,400,{error:"Choose a booking and a valid venue response."});return true;
   }
   const result=await pool.query(`WITH changed AS (
     UPDATE messages m SET venue_status=$1 FROM conversations c
     WHERE m.id=$2 AND m.room_id=c.id AND m.location IS NOT NULL AND m.venue_status IS NULL
       AND m.sender_id<>$3 AND (c.first_id=$3 OR c.second_id=$3)
       AND ($1='declined' OR EXISTS (SELECT 1 FROM bookings b WHERE b.id=$4
         AND b.status IN ('awaiting_immediate_payment','booking_confirmed_and_paid')
         AND ((b.learner_id=c.first_id AND b.coach_id=c.second_id) OR (b.learner_id=c.second_id AND b.coach_id=c.first_id))))
     RETURNING m.*
   ), logged AS (
     INSERT INTO booking_venue_log (id,booking_id,message_id,accepted_by,location)
     SELECT $5,$4,id,$3,location FROM changed WHERE venue_status='accepted' RETURNING id
   ) SELECT room_id FROM changed`,[action==='accept'?'accepted':'declined',venueMatch[1],userId,bookingId||null,randomUUID()]);
   if(!result.rowCount) {sendJson(response,409,{error:"Venue already answered, or the booking is unavailable."});return true;}
   sendJson(response,200,(await rooms(pool,userId)).find(r=>r.id===result.rows[0].room_id));return true;
 }
 if (request.method === "GET" && url.pathname === "/api/conversations") {
   const userId=url.searchParams.get("userId");
   if(!userId) {sendJson(response,400,{error:"An account is required."});return true;}
   sendJson(response,200,await rooms(pool,userId));return true;
 }
 if(request.method === "POST" && url.pathname === "/api/conversations") {
   const {userId,participantId}=await readBody(request);
   if(!userId || !participantId || userId===participantId) {sendJson(response,400,{error:"Select another account to message."});return true;}
   const [first,second]=[userId,participantId].sort();
   const result=await pool.query(`INSERT INTO conversations (id,first_id,second_id) VALUES ($1,$2,$3)
     ON CONFLICT(first_id,second_id) DO UPDATE SET first_id=EXCLUDED.first_id RETURNING id`,[randomUUID(),first,second]);
   sendJson(response,200,(await rooms(pool,userId)).find(r=>r.id===result.rows[0].id));return true;
 }
 const match=url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
 if(request.method === "POST" && match) {
   const {userId,text,location}=await readBody(request);
   if(!userId || typeof text!=="string" || !text.trim() || text.length>10000) {sendJson(response,400,{error:"Enter a message of up to 10,000 characters."});return true;}
   const inserted=await pool.query(`INSERT INTO messages (id,room_id,sender_id,text,location)
     SELECT $1,id,$3,$4,$5 FROM conversations WHERE id=$2 AND (first_id=$3 OR second_id=$3) RETURNING id`,
     [randomUUID(),match[1],userId,text.trim(),location ? JSON.stringify(location) : null]);
   if(!inserted.rowCount) {sendJson(response,403,{error:"Conversation unavailable."});return true;}
   sendJson(response,201,(await rooms(pool,userId)).find(r=>r.id===match[1]));return true;
 }
 if(request.method === "GET" && url.pathname === "/api/notifications") {
   const userId=url.searchParams.get("userId");
   if(!userId) {sendJson(response,400,{error:"An account is required."});return true;}
   const result=await pool.query(`WITH events AS (
     SELECT 'booking:'||b.id AS id, 'booking' AS type, b.id AS target_id,
       l.name||' requested a lesson booking' AS title, b.created_at
       FROM bookings b JOIN profiles l ON l.id=b.learner_id
       WHERE b.coach_id=$1 AND b.status='pending_coach_approval'
     UNION ALL
     SELECT 'booking-approved:'||b.id, 'booking', b.id,
       c.name||' approved your booking request', COALESCE(b.approved_at, b.created_at)
       FROM bookings b JOIN profiles c ON c.id=b.coach_id
       WHERE b.learner_id=$1 AND b.status IN ('awaiting_immediate_payment', 'booking_confirmed_and_paid')
     UNION ALL
     SELECT 'booking-change:'||(b.change_request->>'id'), 'booking', b.id,
       'New booking '||(CASE WHEN b.change_request->>'kind'='cancel' THEN 'cancellation' ELSE 'alteration' END)||' request',
       (b.change_request->>'createdAt')::timestamptz
       FROM bookings b WHERE (b.learner_id=$1 OR b.coach_id=$1) AND b.change_request IS NOT NULL AND b.change_request->>'requestedBy'<>$1::text
     UNION ALL
     SELECT 'lesson-due:'||b.id||':'||(s->>'date')||'T'||(s->>'time'), 'booking', b.id,
       'Confirm lesson completion and rate '||p.name,
       (COALESCE(s->>'endDate',s->>'date')||'T'||(s->>'endTime'))::timestamp AT TIME ZONE 'Africa/Johannesburg'
       FROM bookings b CROSS JOIN LATERAL jsonb_array_elements(b.details->'sessions') s
       JOIN profiles p ON p.id=CASE WHEN b.learner_id=$1 THEN b.coach_id ELSE b.learner_id END
       WHERE (b.learner_id=$1 OR b.coach_id=$1) AND b.status='booking_confirmed_and_paid'
       AND ((COALESCE(s->>'endDate',s->>'date')||'T'||(s->>'endTime'))::timestamp AT TIME ZONE 'Africa/Johannesburg')<=NOW()
       AND NOT EXISTS(SELECT 1 FROM lesson_feedback f WHERE f.booking_id=b.id AND f.user_id=$1 AND f.slot=(s->>'date')||'T'||(s->>'time'))
     UNION ALL
     SELECT 'message:'||m.id, 'message', m.room_id, p.name||' sent you a message', m.created_at
       FROM messages m JOIN conversations c ON c.id=m.room_id JOIN profiles p ON p.id=m.sender_id
       WHERE (c.first_id=$1 OR c.second_id=$1) AND m.sender_id<>$1
   ) SELECT e.*, (r.notification_id IS NOT NULL) AS read FROM events e
     LEFT JOIN notification_reads r ON r.user_id=$1 AND r.notification_id=e.id
     WHERE e.type <> 'message' OR r.notification_id IS NULL
     ORDER BY e.created_at DESC, e.id DESC`,[userId]);
   sendJson(response,200,result.rows);return true;
 }
 if(request.method === "POST" && url.pathname === "/api/notifications/read") {
   const {userId,ids}=await readBody(request);
   if(!userId || !Array.isArray(ids) || ids.length>1000 || ids.some(id=>typeof id!=="string")) {
     sendJson(response,400,{error:"Invalid notification selection."});return true;
   }
   await pool.query(`INSERT INTO notification_reads (user_id,notification_id)
     SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING`,[userId,ids]);
   sendJson(response,200,{saved:true});return true;
 }
 return false;
}
