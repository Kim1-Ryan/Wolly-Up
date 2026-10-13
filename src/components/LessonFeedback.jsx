import { useEffect, useState } from "react";
import "./LessonFeedback.css";

const ratingLabels = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

function LessonReview({ booking, session, index, userId, name, onChanged }) {
  const [rating,setRating]=useState("");
  const [completed,setCompleted]=useState(false);
  const [comment,setComment]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const slot=`${session.date}T${session.time}`;
  const mine=booking.feedback.find(f=>f.userId===userId&&f.slot===slot);
  const other=booking.feedback.find(f=>f.userId!==userId&&f.slot===slot);
  if(mine) return <div className="booking-log-entry" id={`lesson-feedback-${booking.id}-${slot}`} tabIndex={-1}><strong>Lesson {index+1}: completion confirmed</strong><p>Your rating of {name}: {mine.rating}/5. {other?'Both people have confirmed completion.':'Awaiting the other person’s confirmation.'}</p></div>;
  return <form className="venue-share-form lesson-review-form" id={`lesson-feedback-${booking.id}-${slot}`} tabIndex={-1} noValidate onSubmit={async e=>{
    e.preventDefault();if(busy)return;
    if(!completed||!rating){setError('Confirm completion and select a rating.');return;}
    setBusy(true);setError('');
    try {const r=await fetch(`/api/bookings/${booking.id}/feedback`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,slot,completed,rating:Number(rating),comment})});const data=await r.json();if(!r.ok)throw Error(data.error);onChanged(data);}catch(err){setError(err.message);}finally{setBusy(false);}
  }}>
    <div className="lesson-review-heading"><div><span className="lesson-review-eyebrow">Lesson {index+1} feedback</span><h4>How did your lesson go?</h4></div><span className="lesson-review-date">{new Date(`${session.date}T12:00:00`).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})} · {session.time} SAST</span></div>
    <label className="lesson-review-confirm"><input type="checkbox" checked={completed} disabled={busy} onChange={e=>{setCompleted(e.target.checked);setError('');}}/><span>I confirm this lesson was completed</span></label>
    <fieldset className="lesson-review-rating" disabled={busy}>
      <legend>Rate your experience with {name}</legend>
      <div className="lesson-rating-options">{ratingLabels.map((label,i)=><label className={`lesson-rating-choice ${Number(rating)>=i+1?'is-filled':''}`} key={label} title={`${i+1} / 5 — ${label}`}>
        <input type="radio" name={`rating-${booking.id}-${slot}`} value={i+1} aria-label={`${i+1} ${i===0?'star':'stars'} — ${label}`} checked={Number(rating)===i+1} onChange={e=>{setRating(e.target.value);setError('');}}/>
        <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.5 2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55-4.76-4.64 6.58-.96Z"/></svg></span>
      </label>)}</div>
      <p className="lesson-rating-description" aria-live="polite">{rating ? `${rating} / 5 · ${ratingLabels[Number(rating)-1]}` : 'Click a star to choose your rating'}</p>
    </fieldset>
    <label className="lesson-review-comments"><span>Comments <small>(optional)</small></span><textarea value={comment} disabled={busy} rows={3} placeholder="What went well, or what could be improved?" maxLength={2000} onChange={e=>setComment(e.target.value)}/></label>
    {error&&<p className="lesson-review-error" role="alert">{error}</p>}
    <div className="lesson-review-footer"><span>Confirm completion and choose a rating to submit.</span><button className="btn-primary" disabled={busy}>{busy?'Saving…':'Submit lesson review'}</button></div>
  </form>;
}
export default function LessonFeedback({ booking, user, isCoach, onChanged }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  if(booking.status!=='booking_confirmed_and_paid')return null;
  return <section>{(booking.sessions||[]).map((session,index)=>
    session.endTime && Date.parse(`${session.endDate||session.date}T${session.endTime}:00+02:00`)<=now&&<LessonReview key={`${session.date}T${session.time}`} booking={{...booking,feedback:booking.feedback||[]}} session={session} index={index} userId={user.id} name={isCoach?booking.learnerName:booking.coachName} onChanged={onChanged}/>
  )}</section>;
}
