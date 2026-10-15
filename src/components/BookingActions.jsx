import { apiFetch } from '../api';
import { useState } from "react";
import InlineFeedback from "./InlineFeedback";
import "./BookingActions.css";
import { packageWindow, dateInWindow, windowMessage } from '../packages';

export default function BookingActions({ booking, userId, onChanged }) {
  const [kind,setKind]=useState("");
  const [reason,setReason]=useState("");
  const [sessions,setSessions]=useState(booking.sessions || []);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const today = new Date();
  const minimumDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const validityWindow = packageWindow(booking.validityStart || booking.sessions?.map(session=>session.date).sort()[0], booking.validityMonths ?? 3);
  async function submit(action) {
    if (busy) return;
    if (action==='request') {
      if (!reason.trim()) { setError('Please enter a reason for this request.'); return; }
      if (kind==='edit') {
        const invalid = sessions.findIndex(s => !s.date || !s.time || !Number.isFinite(Date.parse(`${s.date}T${s.time}`)) || Date.parse(`${s.date}T${s.time}`)<=Date.now());
        if (invalid>=0) { setError(`Lesson ${invalid+1}: choose a date and time in the future. Past lessons cannot be requested.`); return; }
        if (validityWindow && sessions.some(session=>!dateInWindow(session.date,validityWindow))) { setError(windowMessage(validityWindow)); return; }
      }
    }
    setBusy(true);setError("");setConfirmation("");
    try {
      const response=await apiFetch(`/api/bookings/${booking.id}/change-request`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,action,kind,reason,sessions})});
      const data=await response.json();if(!response.ok)throw Error(data.error || "Unable to update booking.");
      onChanged(data);setKind("");setReason("");
      setConfirmation(action==='request' ? `${kind==='cancel'?'Cancellation':'Edit'} request sent. Awaiting the other person's response.` : action==='accept'?'Request accepted. Booking updated.':'Request declined. Booking unchanged.');
    } catch(err){setError(err.message);}finally{setBusy(false);}
  }
  const pending=booking.changeRequest;
  return <div className="booking-actions">
    {error&&!kind&&<p role="status">{error}</p>}
    <InlineFeedback message={confirmation} onDismiss={()=>setConfirmation("")} />
    {booking.status==='cancelled'&&<p><strong>Booking cancelled</strong></p>}
    {pending && pending.requestedBy===userId ? <details className="booking-details-log">
      <summary>{pending.kind==='cancel'?'Cancellation':'Edit'} request pending</summary>
      <p>{pending.reason}</p>
      {pending.kind==='edit'&&<ul>{pending.sessions.map((s,i)=><li key={i}>Lesson {i+1}: {s.date} at {s.time}</li>)}</ul>}
      <p>The current booking stays in place until accepted.</p>
    </details> : pending ? <section className="venue-share-form">
      <strong>{pending.kind==='cancel'?'Cancellation requested':'Booking alteration requested'}</strong>
      <p>{pending.reason}</p>
      {pending.kind==='edit'&&<ul>{pending.sessions.map((s,i)=><li key={i}>Lesson {i+1}: {s.date} at {s.time}</li>)}</ul>}
      {pending.requestedBy===userId ? <p>Awaiting the other person's response. The current booking stays in place until accepted.</p> : <div className="venue-actions">
        <button className="btn-primary" disabled={busy} onClick={()=>submit('accept')}>Accept {pending.kind==='cancel'?'cancellation':'changes'}</button>
        <button className="btn-secondary" disabled={busy} onClick={()=>submit('decline')}>Decline request</button>
      </div>}
    </section> : ['pending_coach_approval','awaiting_immediate_payment','booking_confirmed_and_paid'].includes(booking.status)&&<>
      <div className="venue-actions booking-change-options" aria-label="Booking actions">
        <button className="btn-secondary" disabled={busy} aria-pressed={kind==='edit'} onClick={()=>{setKind('edit');setError('');setSessions(booking.sessions || []);}}>Edit dates</button>
        <button className="btn-secondary" disabled={busy} aria-pressed={kind==='cancel'} onClick={()=>{setKind('cancel');setError('');}}>Cancel booking</button>
      </div>
      {kind&&<form className="venue-share-form booking-change-form" noValidate onSubmit={e=>{e.preventDefault();void submit('request');}}>
        <header className="booking-change-heading"><h4>{kind==='cancel'?'Request cancellation':'Change your lesson dates'}</h4><p>{kind==='cancel'?'Let the other person know why you need to cancel.':'Choose a new date and time for each lesson.'}</p></header>
        {error&&<p role="alert" className="booking-form-error">{error}</p>}
        {kind==='edit'&&sessions.map((s,i)=><fieldset className="booking-change-lesson" disabled={busy} key={i}>
          <legend>Lesson {i+1}</legend>
          <div className="booking-change-fields">
          <label>Date<input type="date" min={validityWindow && validityWindow.start > minimumDate ? validityWindow.start : minimumDate} max={validityWindow?.end} value={s.date} required onChange={e=>{setError(validityWindow && e.target.value && !dateInWindow(e.target.value,validityWindow) ? windowMessage(validityWindow) : '');setSessions(prev=>prev.map((v,j)=>j===i?{...v,date:e.target.value}:v));}}/></label>
          <label>Time<input type="time" value={s.time} required onChange={e=>setSessions(prev=>prev.map((v,j)=>j===i?{...v,time:e.target.value}:v))}/></label>
          </div>
          <small>{s.date && Number.isFinite(Date.parse(`${s.date}T00:00`)) ? new Date(`${s.date}T00:00`).toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'}) : 'Choose a future date'} · South African time (SAST)</small>
        </fieldset>)}
        <label className="booking-change-reason">Reason for {kind==='cancel'?'cancelling':'the change'}<textarea value={reason} disabled={busy} placeholder={kind==='cancel'?'Explain why you need to cancel…':'Let the other person know what has changed…'} onChange={e=>setReason(e.target.value)} required maxLength={2000} rows={3}/></label>
        <p className="booking-change-note">Changes take effect once the other person accepts. No payment or refund is processed.</p>
        <div className="venue-actions booking-change-footer"><button className="btn-primary" disabled={busy}>{busy?'Sending…':kind==='cancel'?'Request cancellation':'Send change request'}</button><button type="button" className="btn-secondary" disabled={busy} onClick={()=>{setKind('');setError('');}}>Keep booking</button></div>
      </form>}
    </>}
    {!!booking.changeLog?.length&&<details className="booking-details-log"><summary>Booking changes log</summary>{booking.changeLog.map(entry=><div className="booking-log-entry" key={entry.id}>
      <strong>{entry.kind==='cancel'?'Cancellation':'Alteration'} — {entry.decision==='accept'?'accepted':'declined'}</strong><p>{entry.reason}</p>
      {entry.kind==='edit'&&<ul>{entry.sessions.map((s,i)=><li key={i}>{s.date} at {s.time}</li>)}</ul>}<small>{new Date(entry.respondedAt).toLocaleString()}</small>
    </div>)}</details>}
  </div>;
}
