import { apiFetch } from '../api';
import BookingList from "./BookingList";
import ProfileReviews from "./ProfileReviews";
import LearnerRating from "./LearnerRating";
import ProfileAvatar from "./ProfileAvatar";
import InlineFeedback from "./InlineFeedback";
import { useState } from "react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

function LearnerProfile({ user, bookings, onExecutePayment, onUpdateProfile, onMessageInit, onBookingChanged, bookingTarget }) {
  const [feedback, setFeedback] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState(user.bio);
  const [editExpertise, setEditExpertise] = useState(user.expertise);
  const [activePaymentBookingId, setActivePaymentBookingId] = useState(null);
  const [editPhoto, setEditPhoto] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSaveEdits() {
    if (saving) return;
    if (editPhoto && (!['image/jpeg', 'image/png', 'image/webp'].includes(editPhoto.type) || editPhoto.size > 5*1024*1024)) { setFeedback('Choose a JPG, PNG, or WebP photo smaller than 5 MB.'); return; }
    setSaving(true);
    try {
      let profileImage = user.profileImage || null;
      if (editPhoto) profileImage = await new Promise((resolve,reject)=>{ const reader = new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(new Error('Unable to read your photo.')); reader.readAsDataURL(editPhoto); });
      const response = await apiFetch(`/api/profiles/${user.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({bio:editBio,expertise:editExpertise,profileImage}) });
      const profile = await response.json();
      if (!response.ok) throw new Error(profile.error || 'Unable to save profile.');
      onUpdateProfile(profile); setIsEditing(false); setEditPhoto(null);
    } catch(error) { setFeedback(error.message); } finally { setSaving(false); }
  }

  async function handleMockPaymentGatewaySubmit(e) {
    e.preventDefault();
    const saved = await onExecutePayment(activePaymentBookingId);
    if (!saved) return;
    setActivePaymentBookingId(null);
    setFeedback("Demo payment recorded. No funds were transferred.");
  }

  return (
    <div className="profile-layout-container">
      <InlineFeedback message={feedback} onDismiss={() => setFeedback("")} />
      <div className="profile-header-card learner-card-mods">
        <div className="profile-title-row learner-name-row">
          <div className="learner-name-identity"><ProfileAvatar user={user}/>
            <h2>
              {user.name}
              {user.isVerified && <CheckCircleIcon className="verified-check" titleAccess="Verified profile" />}
            </h2>
          </div>
          <span className={`learner-skill-level badge badge-${user.expertise || 'beginner'}`}>{user.expertise || 'beginner'}</span>
        </div>
        <p className="profile-loc">{user.location || "Location pending"}</p>
          {user.isVerified && <span className="verification-badge">Verified</span>}
        <div className="learner-meta-row profile-meta-row">
          <span>{user.age ? `${user.age} years old` : "Age pending"}</span>
        </div>
        <LearnerRating user={user} />

        {isEditing ? (
          <div className="inline-editor-box full-width-editor">
            <div className="learner-photo-editor"><label>Profile photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={e=>setEditPhoto(e.target.files[0] || null)}/></label><p>JPG, PNG or WebP, up to 5 MB. Without a photo, your initials are displayed.</p></div>
            <textarea value={editBio} onChange={function(e) { setEditBio(e.target.value); }} className="edit-textarea" />
            <select value={editExpertise} onChange={function(e) { setEditExpertise(e.target.value); }} className="filter-select" style={{ margin: "10px 0", display: "block" }}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
            <div className="editor-controls">
              <button className="btn-primary" disabled={saving} onClick={handleSaveEdits}>{saving?'Saving…':'Save changes'}</button>
              <button className="btn-secondary" disabled={saving} onClick={function() { setIsEditing(false); setEditPhoto(null); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="bio-display-row">
            <p className="coach-bio-paragraph">{user.bio}</p>
            <button className="btn-edit-toggle" onClick={function() { setIsEditing(true); }}>Edit profile</button>
          </div>
        )}
      </div>

      {activePaymentBookingId && (
        <div className="mrd-payment-modal-overlay">
          <div className="mrd-payment-card">
            <div className="mrd-payment-header">
              <h3>Secure Centralized Payment Interface System</h3>
              <p>Powered via Card-Present Tokenization Security Frameworks</p>
            </div>
            <form onSubmit={handleMockPaymentGatewaySubmit} className="mrd-payment-form">
              <label>Cardholder Legal Identity Name:</label>
              <input type="text" required placeholder="e.g. K R MCHUNU" />
              <label>Visa/Mastercard 16-Digit Structural Code:</label>
              <input type="text" maxLength="16" pattern="\d{16}" required placeholder="4000 1234 5678 9010" />
              <div className="form-row">
                <div>
                  <label>Expiry (MM/YY):</label>
                  <input type="text" maxLength="5" placeholder="11/29" required />
                </div>
                <div>
                  <label>Security CVV Vault Key:</label>
                  <input type="password" maxLength="3" placeholder="***" required />
                </div>
              </div>
              <div className="payment-summary-line">
                <span>Immediate Settlement Transfer Amount due:</span>
                <strong>{bookings.find(function(b) { return b.id === activePaymentBookingId; })?.rate}</strong>
              </div>
              <div className="editor-controls">
                <button type="submit" className="mrd-checkout-btn">Authorize Immediate Settlement Transfer</button>
                <button type="button" className="btn-secondary" onClick={function() { setActivePaymentBookingId(null); }}>Cancel Checkout</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ProfileReviews user={user} />
      <BookingList key={bookingTarget?.key || 'bookings'} initialBookingId={bookingTarget?.target_id} bookings={bookings} user={user} onChanged={onBookingChanged} onMessageInit={onMessageInit} onCheckout={setActivePaymentBookingId} />

    </div>
  );
}

export default LearnerProfile;
