import React from "react";
import VenueLinks from "./VenueLinks";

export default function ConfirmedLesson({ booking, isCoach = false, onMessageInit }) {
  const name = isCoach ? booking.learnerName : booking.coachName;
  return <section style={{ background: "#edf6f0", border: "1px solid #c8dfcf", borderRadius: 12, padding: 20, marginTop: 16 }}>
    <strong style={{ color: "#215c3d" }}>✓ Booking confirmed — ready for your lesson</strong>
    <p>{booking.package} with {name}</p>
    <ul>{(booking.sessions || []).map((session, index) => <li key={`${session.date}-${session.time}`}>
      Lesson {index + 1}: {new Date(`${session.date}T${session.time}`).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })} at {session.time}{session.endTime ? `–${session.endTime}` : ""}
    </li>)}</ul>
    {booking.venueLog?.length ? <p><strong>Venue confirmed:</strong> {booking.venueLog[0].location.venue}. Attend your lesson at the scheduled time. The address and directions are in the booking details log below.</p> : <p><strong>Next step:</strong> Message {name} to agree on the venue and anything to bring. Then attend your lesson at the scheduled time.</p>}
    <button className="btn-primary" onClick={() => onMessageInit(isCoach ? booking.learnerId : booking.coachId)}>Message {isCoach ? "learner" : "coach"}</button>
    <details className="booking-details-log">
      <summary>Booking details log{booking.venueLog?.length ? ` (${booking.venueLog.length})` : ""}</summary>
      <p>Shared with the learner and coach. The latest accepted venue is shown first.</p>
      {!booking.venueLog?.length && <p>No venue has been accepted yet.</p>}
      {booking.venueLog?.map(entry => <div key={entry.id} className="booking-log-entry">
        <strong>{entry.location.venue}</strong><p>{entry.location.address}</p>
        <small>Accepted by {entry.acceptedBy} · {new Date(entry.createdAt).toLocaleString()}</small>
        <VenueLinks location={entry.location} />
      </div>)}
    </details>
    <p style={{ fontSize: "0.85rem", marginBottom: 0 }}>Test booking: payment was simulated. No money was transferred.</p>
  </section>;
}
