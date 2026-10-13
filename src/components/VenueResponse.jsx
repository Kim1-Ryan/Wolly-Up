import React, { useState } from "react";

export default function VenueResponse({ message, bookings, onRespond, isSender }) {
  const [bookingId, setBookingId] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = bookingId || (bookings.length === 1 ? bookings[0].id : "");
  if (message.venueStatus) return <p className="venue-response-status">{message.venueStatus === "accepted" ? "✓ Venue accepted and saved to booking details" : "Venue declined — please arrange another location"}</p>;
  if (isSender) return <p className="venue-response-status">Awaiting venue acceptance</p>;
  async function respond(action) {
    setBusy(true);
    try { await onRespond(action, selected); } finally { setBusy(false); }
  }
  return <div className="venue-response">
    {bookings.length > 1 && <label>Booking for this venue<select value={selected} onChange={e => setBookingId(e.target.value)}>
      <option value="">Choose a booking</option>
      {bookings.map(b => <option key={b.id} value={b.id}>{b.package} · {b.sessions?.[0]?.date}</option>)}
    </select></label>}
    {!bookings.length && <p>A booking with this person must be approved before accepting a venue.</p>}
    <div className="venue-actions">
      <button type="button" className="btn-primary" disabled={busy || !selected} onClick={() => respond("accept")}>Accept venue</button>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => respond("decline")}>Decline</button>
    </div>
  </div>;
}
