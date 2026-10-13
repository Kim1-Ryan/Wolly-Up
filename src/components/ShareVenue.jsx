import React, { useState } from "react";
import VenueLinks from "./VenueLinks";

export default function ShareVenue({ onShare }) {
  const [open, setOpen] = useState(false);
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [sending, setSending] = useState(false);
  if (!open) return <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>Share venue location</button>;
  return <form className="venue-share-form" onSubmit={async event => {
    event.preventDefault();
    if (sending || !venue.trim() || !address.trim()) return;
    setSending(true);
    try {
      if (await onShare({ venue: venue.trim(), address: address.trim() })) {
        setVenue(""); setAddress(""); setOpen(false);
      }
    } finally { setSending(false); }
  }}>
    <strong>Share a lesson venue</strong>
    <label>Venue name<input value={venue} onChange={e => setVenue(e.target.value)} required autoFocus /></label>
    <label>Full street address<input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, suburb, city, postcode" required /></label>
    <p className="venue-map-hint">Check the venue on Google Maps before sharing. Include the city to help find the right location.</p>
    {(venue.trim() || address.trim()) && <VenueLinks location={{ venue: venue.trim(), address: address.trim() }} />}
    <div className="venue-actions">
      <button type="submit" className="btn-primary" disabled={sending || !venue.trim() || !address.trim()}>{sending ? "Sharing…" : "Share venue"}</button>
      <button type="button" className="btn-secondary" disabled={sending} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  </form>;
}
