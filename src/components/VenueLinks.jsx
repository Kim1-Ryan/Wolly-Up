import React from "react";

export default function VenueLinks({ location }) {
  const query = [location.venue, location.address].filter(Boolean).join(", ");
  if (!query) return null;
  return <div className="venue-map-links">
    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer">View on Google Maps ↗</a>
    <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer">Get directions ↗</a>
  </div>;
}
