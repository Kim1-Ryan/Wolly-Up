import React from "react";
import "./InlineFeedback.css";

export default function InlineFeedback({ message, onDismiss }) {
  if (!message) return null;
  return <div className="inline-feedback" role="status" aria-live="polite">
    <span>{message}</span>
    <button type="button" onClick={onDismiss} aria-label="Dismiss message">×</button>
  </div>;
}
