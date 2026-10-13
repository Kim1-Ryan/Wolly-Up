import { useState } from "react";
import BookingActions from "./BookingActions";
import ConfirmedLesson from "./ConfirmedLesson";
import LessonFeedback from "./LessonFeedback";
import VenueLinks from "./VenueLinks";
import { isLessonCompleted, isBookingCompleted } from './bookingCompletion';
import './CompletedLessons.css';

const labels = {pending_coach_approval:"Awaiting coach approval",awaiting_immediate_payment:"Awaiting payment",booking_confirmed_and_paid:"Confirmed",cancelled:"Cancelled",declined_by_coach:"Declined"};

export default function BookingList({ bookings, user, isCoach = false, onChanged, onCoachAction, onMessageInit, onCheckout, initialBookingId = null }) {
  const [selectedId,setSelectedId]=useState(initialBookingId);
  const [busy,setBusy]=useState(false);
  const [declining,setDeclining]=useState(false);
  const [declineReason,setDeclineReason]=useState('');
  const [declineError,setDeclineError]=useState('');
  const selected=bookings.find(b=>b.id===selectedId);
  const name=b=>isCoach?b.learnerName:b.coachName;
  const declinedBookings = bookings.filter(b=>b.status==='declined_by_coach');
  const completedLessons = bookings.flatMap(booking => (booking.sessions || []).flatMap((session, index) =>
    isLessonCompleted(booking, session) ? [{ booking, session, index }] : []))
    .sort((a, b) => `${b.session.date}T${b.session.time}`.localeCompare(`${a.session.date}T${a.session.time}`));
  const groups=[
    {title:"Pending requests",items:bookings.filter(b=>['pending_coach_approval','awaiting_immediate_payment'].includes(b.status))},
    {title:"Confirmed bookings",items:bookings.filter(b=>b.status==='booking_confirmed_and_paid' && !isBookingCompleted(b))},
    {title:"Closed bookings",items:bookings.filter(b=>b.status==='cancelled')}
  ];
  if(selected) return <div className="booking-browser" id={`booking-${selected.id}`} tabIndex={-1}>
    <button className="conversation-back" onClick={()=>setSelectedId(null)}>← All bookings</button>
    <h3>Booking with {name(selected)}</h3>
    <span className="booking-list-status">{isBookingCompleted(selected) ? 'Completed' : labels[selected.status] || selected.status}</span>
    {selected.status==='booking_confirmed_and_paid' ? (isBookingCompleted(selected) ? <p>All lessons in this package are completed. Return to all bookings to view the completed lesson records.</p> : <ConfirmedLesson booking={selected} isCoach={isCoach} onMessageInit={onMessageInit}/>) : <>
      <p><strong>{selected.package}</strong> · {selected.rate}</p>
      <ul>{(selected.sessions || []).map((s,i)=><li key={i}>Lesson {i+1}: {s.date} at {s.time}</li>)}</ul>
      {isCoach&&selected.status==='pending_coach_approval'&&<div className="venue-actions">
        <button className="btn-primary" disabled={busy} onClick={async()=>{setBusy(true);try{await onCoachAction(selected.id,'accept');}finally{setBusy(false);}}}>Approve booking</button>
        <button className="btn-secondary" disabled={busy} onClick={()=>setDeclining(true)}>Decline booking</button>
      </div>}
      {isCoach&&selected.status==='pending_coach_approval'&&declining&&<form className="venue-share-form booking-decline-form" onSubmit={async e=>{
        e.preventDefault(); if(busy)return;
        if(!declineReason.trim()){setDeclineError('Please provide a reason for declining.');return;}
        setBusy(true);setDeclineError('');
        try {const saved=await onCoachAction(selected.id,'reject',declineReason.trim());if(saved){setSelectedId(null);setDeclining(false);setDeclineReason('');}}finally{setBusy(false);}
      }}>
        <label>Reason for declining<textarea required maxLength={2000} rows={3} disabled={busy} value={declineReason} placeholder="Let the learner know why you cannot accept this request…" onChange={e=>setDeclineReason(e.target.value)}/></label>
        <small>This reason will be visible to the learner.</small>
        {declineError&&<p role="alert">{declineError}</p>}
        <div className="venue-actions"><button className="btn-primary" disabled={busy}>{busy?'Declining…':'Confirm decline'}</button><button type="button" className="btn-secondary" disabled={busy} onClick={()=>setDeclining(false)}>Keep request</button></div>
      </form>}
      {selected.status==='declined_by_coach'&&<p><strong>Reason for declining:</strong> {selected.declineReason || 'No reason was recorded for this older request.'}</p>}
      {!isCoach&&selected.status==='awaiting_immediate_payment'&&<button className="btn-primary" onClick={()=>onCheckout(selected.id)}>Proceed to checkout</button>}
    </>}
    <LessonFeedback key={`feedback-${selected.id}`} booking={selected} user={user} isCoach={isCoach} onChanged={onChanged}/>
    {!isBookingCompleted(selected) && <BookingActions key={selected.id} booking={selected} userId={user.id} onChanged={onChanged}/>}
  </div>;
  return <div className="booking-browser">
    <h3>Your bookings</h3>
    {groups.filter(g=>g.title!=='Closed bookings'||g.items.length).map(group=><section className="booking-list-group" key={group.title}>
      <h4>{group.title}<span>{group.items.length}</span></h4>
      {!group.items.length&&<p className="booking-list-empty">No {group.title.toLowerCase()}.</p>}
      <div className="conversation-list">{group.items.map(b=><button className="conversation-list-item" key={b.id} onClick={()=>setSelectedId(b.id)}>
        <span className="conversation-avatar" aria-hidden="true">{name(b)?.charAt(0).toUpperCase()}</span>
        <span className="conversation-preview"><strong>{name(b)}</strong><span>{b.package} · {b.sessions?.[0]?.date} at {b.sessions?.[0]?.time}</span>{b.changeRequest&&<small>Change request pending</small>}</span>
        <span className="booking-list-status">{labels[b.status] || b.status}</span><span aria-hidden="true">›</span>
      </button>)}</div>
    </section>)}
    <details className="completed-lessons">
      <summary>Completed lessons <span className="completed-lessons-count">{completedLessons.length}</span></summary>
      {!completedLessons.length && <p className="booking-list-empty">Lessons appear here once both participants confirm completion.</p>}
      <div className="completed-lessons-list">{completedLessons.map(({ booking, session, index }) => <article className="completed-lesson" key={`${booking.id}-${session.date}-${session.time}`}>
        <div className="completed-lesson-heading"><div><strong>{name(booking)}</strong><p>Lesson {index + 1} · {new Date(`${session.date}T12:00:00`).toLocaleDateString('en-ZA', {day:'numeric',month:'short',year:'numeric'})} at {session.time}</p></div><span className="booking-list-status">Completed</span></div>
        <details className="completed-lesson-details"><summary>Booking details</summary>
          <dl><dt>Package</dt><dd>{booking.package}</dd><dt>Package total</dt><dd>{booking.rate}</dd><dt>Coach</dt><dd>{booking.coachName}</dd><dt>Learner</dt><dd>{booking.learnerName}</dd><dt>Booking reference</dt><dd title={booking.id}>WU-{booking.id.replaceAll('-', '').slice(0, 8).toUpperCase()}</dd></dl>
          <h5>Lesson schedule</h5><ul>{booking.sessions.map((s,i)=><li key={`${s.date}-${s.time}`}>Lesson {i+1}: {s.date} · {s.time}{s.endTime ? `–${s.endTime}${s.endDate && s.endDate !== s.date ? ` (${s.endDate})` : ''}` : ''} SAST{isLessonCompleted(booking,s) ? ' · Completed' : ''}</li>)}</ul>
          <h5>Completion and reviews</h5>{(booking.feedback || []).filter(f=>f.slot===`${session.date}T${session.time}`).map(f=><div className="booking-log-entry" key={f.userId}><strong>{f.userId===booking.coachId?booking.coachName:booking.learnerName} · {f.rating}/5</strong>{f.comment&&<p>{f.comment}</p>}<small>{new Date(f.createdAt).toLocaleString('en-ZA')}</small></div>)}
          <h5>Venue history</h5>{!booking.venueLog?.length && <p>No venue was recorded.</p>}{booking.venueLog?.map(entry=><div className="booking-log-entry" key={entry.id}><strong>{entry.location.venue}</strong><p>{entry.location.address}</p><small>Accepted by {entry.acceptedBy} · {new Date(entry.createdAt).toLocaleString('en-ZA')}</small><VenueLinks location={entry.location}/></div>)}
          {booking.changeRequest && <><h5>Pending booking request</h5><p>{booking.changeRequest.kind}: {booking.changeRequest.reason}</p>{booking.changeRequest.sessions?.map((s,i)=><p key={i}>Lesson {i+1}: {s.date} at {s.time}</p>)}</>}
          {!!booking.changeLog?.length && <><h5>Booking change history</h5>{booking.changeLog.map(entry=><div className="booking-log-entry" key={entry.id}><strong>{entry.kind} · {entry.decision}</strong><p>{entry.reason}</p>{entry.sessions?.map((s,i)=><p key={i}>Lesson {i+1}: {s.date} at {s.time}</p>)}<small>{new Date(entry.respondedAt).toLocaleString('en-ZA')}</small></div>)}</>}
          <p className="completed-lesson-payment">Payment was simulated. No funds were transferred.</p>
        </details>
      </article>)}</div>
    </details>
    <details className="completed-lessons">
      <summary>Declined bookings <span className="completed-lessons-count">{declinedBookings.length}</span></summary>
      {!declinedBookings.length&&<p className="booking-list-empty">No declined bookings.</p>}
      <div className="completed-lessons-list">{declinedBookings.map(booking=><article className="completed-lesson" key={booking.id}>
        <div className="completed-lesson-heading"><div><strong>{name(booking)}</strong><p>{booking.package}</p></div><span className="booking-list-status">Declined</span></div>
        <details className="completed-lesson-details"><summary>Booking details</summary>
          <h5>Reason for declining</h5><p>{booking.declineReason || 'No reason was recorded for this older request.'}</p>
          <dl><dt>Package</dt><dd>{booking.package}</dd><dt>Package total</dt><dd>{booking.rate}</dd><dt>Coach</dt><dd>{booking.coachName}</dd><dt>Learner</dt><dd>{booking.learnerName}</dd><dt>Booking reference</dt><dd title={booking.id}>WU-{booking.id.replaceAll('-', '').slice(0, 8).toUpperCase()}</dd></dl>
          <h5>Requested lesson schedule</h5><ul>{(booking.sessions||[]).map((s,i)=><li key={`${s.date}-${s.time}`}>Lesson {i+1}: {s.date} · {s.time}{s.endTime?`–${s.endTime}`:''} SAST</li>)}</ul>
          <h5>Venue history</h5>{!booking.venueLog?.length&&<p>No venue was recorded.</p>}{booking.venueLog?.map(entry=><div className="booking-log-entry" key={entry.id}><strong>{entry.location.venue}</strong><p>{entry.location.address}</p><small>Accepted by {entry.acceptedBy} · {new Date(entry.createdAt).toLocaleString('en-ZA')}</small><VenueLinks location={entry.location}/></div>)}
          {!!booking.changeLog?.length&&<><h5>Booking change history</h5>{booking.changeLog.map(entry=><div className="booking-log-entry" key={entry.id}><strong>{entry.kind} · {entry.decision}</strong><p>{entry.reason}</p>{entry.sessions?.map((s,i)=><p key={i}>Lesson {i+1}: {s.date} at {s.time}</p>)}<small>{new Date(entry.respondedAt).toLocaleString('en-ZA')}</small></div>)}</>}
        </details>
      </article>)}</div>
    </details>
  </div>;
}
