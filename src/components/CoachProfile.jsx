import { apiFetch } from '../api';
import BookingList from "./BookingList";
import ProfileReviews from "./ProfileReviews";
import InlineFeedback from "./InlineFeedback";
import { useEffect, useRef, useState } from "react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import StarIcon from "@mui/icons-material/Star";
import MessageIcon from "@mui/icons-material/Message";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import "./BookingCalendar.css";
import "./PackageEditor.css";

const LESSON_CATEGORIES = [
  { value: "adult_individual", label: "Adult Individual Lessons (60 mins)" },
  { value: "adult_group", label: "Adult Group Lessons (3-6 people)" },
  { value: "junior_individual", label: "Junior Individual Lessons (60 mins)" }
];
const PACKAGE_OPTIONS = [
  { value: "single", label: "Single session (1 lesson)" },
  { value: "pack_5", label: "5-lesson pack (3-month expiry)" },
  { value: "pack_10", label: "10-lesson pack (3-month expiry)" }
];
const RATE_OPTIONS = LESSON_CATEGORIES.flatMap((category) => PACKAGE_OPTIONS.map((pack) => ({
  id: `${category.value}_${pack.value}`,
  category: category.value,
  packSize: pack.value,
  label: `${category.label}: ${pack.label}`
})));

function ratesToFormValues(rates) {
  return Object.fromEntries(rates.map((rate) => [
    `${rate.category}_${rate.packSize}`,
    String(rate.formattedRate || "").replace(/[^0-9.]/g, "")
  ]));
}

function CoachProfile({ user, isOwnProfile, bookings, onRequestBooking, onCoachAction, onMessageInit, onUpdateProfile, onBookingChanged, bookingTarget }) {
  const [feedback, setFeedback] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState(user.bio);
  const [editTitle, setEditTitle] = useState(user.title || '');
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [selectedPackage, setSelectedPackage] = useState("");
  const [sessions, setSessions] = useState([]);
  const [scheduleError, setScheduleError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [availability, setAvailability] = useState({ coachId: null, dates: [], status: 'loading' });
  useEffect(() => {
    if (isOwnProfile) return;
    let cancelled = false;
    let loading = false;
    async function refreshAvailability() {
      if (loading) return;
      loading = true;
      try {
        const response = await apiFetch(`/api/coaches/${user.id}/availability`);
        if (!response.ok) throw new Error('Availability unavailable');
        const dates = await response.json();
        if (!cancelled) setAvailability({ coachId: user.id, dates, status: 'ready' });
      } catch {
        if (!cancelled) setAvailability({ coachId: user.id, dates: [], status: 'error' });
      } finally { loading = false; }
    }
    void refreshAvailability();
    const timer = setInterval(refreshAvailability, 5000);
    window.addEventListener('focus', refreshAvailability);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', refreshAvailability); };
  }, [user.id, isOwnProfile]);
  const availabilityReady = isOwnProfile || (availability.coachId === user.id && availability.status === 'ready');
  const calendarRef = useRef(null);
  const currentYear = new Date().getFullYear();
  const [calendarYear, setCalendarYear] = useState(currentYear);
  const rawRates = user.ratesStructure?.offerings || (user.ratesStructure ? [user.ratesStructure] : []);
  const offeredRates = Array.isArray(rawRates)
    ? rawRates.filter((offering) => offering?.category && offering?.packSize)
    : [];
  const selectedRate = offeredRates.find((rate) => `${rate.category}-${rate.packSize}` === selectedPackage);
  const requiredLessons = { single: 1, pack_5: 5, pack_10: 10 }[selectedRate?.packSize] || 0;
  const today = new Date().toLocaleDateString('en-CA');
  const formatLessonDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  const [durations, setDurations] = useState(() => Object.fromEntries((user.ratesStructure?.offerings || []).map(o=>[o.category+'_'+o.packSize,o.durationMinutes || ''])));
  const [editableRates, setEditableRates] = useState(() => ratesToFormValues(offeredRates));
  const [editProfilePhoto, setEditProfilePhoto] = useState(null);
  const rating = Number(user.rating);
  const hasRating = Array.isArray(user.reviews) && user.reviews.length > 0 && Number.isFinite(rating) && rating > 0;
  const qualifications = (user.qualifications || []).filter(qualification =>
    typeof qualification === 'string' && !/identity and profile documents verified/i.test(qualification));

  const confirmedBookingDates = new Set(
    [...(availability.coachId === user.id ? availability.dates : []), ...bookings
      .filter((booking) => booking.status === "booking_confirmed_and_paid")
      .flatMap((booking) => (booking.sessions || [booking]).map((session) => session.date))]
  );
  const firstDayOffset = new Date(calendarYear, 0, 1).getDay();
  const daysInCalendarYear = Math.round(
    (new Date(calendarYear + 1, 0, 1) - new Date(calendarYear, 0, 1)) / 86_400_000
  );
  const calendarDays = [
    ...Array.from({ length: firstDayOffset }, () => null),
    ...Array.from({ length: daysInCalendarYear }, function(_, i) {
      const date = new Date(calendarYear, 0, i + 1);
      const dateString = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
      return { dateString, isBooked: confirmedBookingDates.has(dateString) };
    })
  ];
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);
  const calendarMonths = calendarDays.flatMap(function(day, index) {
    if (!day) return [];
    const [year, month, date] = day.dateString.split("-").map(Number);
    if (date !== 1) return [];
    return [{
      label: new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(year, month - 1, date)),
      week: Math.floor(index / 7) + 1
    }];
  });

  function toggleRateOption(optionId) {
    setEditableRates((previous) => {
      const next = { ...previous };
      if (Object.prototype.hasOwnProperty.call(next, optionId)) delete next[optionId];
      else next[optionId] = "";
      return next;
    });
  }

  function startEditing() {
    setEditTitle(user.title || '');
    setEditBio(user.bio);
    setEditableRates(ratesToFormValues(offeredRates));
    setEditProfilePhoto(null);
    setIsEditing(true);
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("The image could not be read."));
      reader.readAsDataURL(file);
    });
  }

  async function handleSaveEdits() {
    if (!editTitle.trim() || editTitle.trim().length > 120) {
      setFeedback('Enter a professional title of up to 120 characters.');
      return;
    }
    const selectedOfferings = RATE_OPTIONS.filter((option) => Object.prototype.hasOwnProperty.call(editableRates, option.id));
    if (selectedOfferings.length === 0 || selectedOfferings.some((option) => !editableRates[option.id] || Number(editableRates[option.id]) < 0)) {
      setFeedback("Select at least one lesson option and enter a valid price for each selected option.");
      return;
    }
    if (editProfilePhoto && (!editProfilePhoto.type.startsWith("image/") || editProfilePhoto.size > 5 * 1024 * 1024)) {
      setFeedback("Your profile photo must be an image smaller than 5 MB.");
      return;
    }
    let profileImage = user.profileImage;
    try {
      if (editProfilePhoto) profileImage = await readImageFile(editProfilePhoto);
    } catch {
      setFeedback("Your profile photo could not be read. Please choose another image.");
      return;
    }
    const response = await apiFetch(`/api/profiles/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bio: editBio,
        title: editTitle.trim(),
        profileImage,
        offerings: selectedOfferings.map((option) => ({
          category: option.category,
          packSize: option.packSize,
          rate: Number(editableRates[option.id]),
          durationMinutes: Number(durations[option.id])
        }))
      })
    });
    const profile = await response.json();
    if (!response.ok) {
      setFeedback(profile.error || "Unable to save your profile changes.");
      return;
    }
    onUpdateProfile(profile);
    setIsEditing(false);
  }

  function selectPackage(offering) {
    if (requesting) return;
    const key = `${offering.category}-${offering.packSize}`;
    if (key !== selectedPackage) {
      setSelectedPackage(key);
      setSessions([]);
      setSelectedDate("");
      setSelectedTime("");
      setScheduleError("");
      setRequestSent(false);
    }
    calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    calendarRef.current?.focus({ preventScroll: true });
  }

  function addSession() {
    if (!availabilityReady) { setScheduleError('Please wait for availability to load.'); return; }
    if (!selectedRate || !selectedDate || !selectedTime) {
      setScheduleError("Choose a package, date and time for this lesson.");
      return;
    }
    if (new Date(`${selectedDate}T${selectedTime}`) <= new Date() || confirmedBookingDates.has(selectedDate)) {
      setScheduleError("Choose an available date and time in the future.");
      return;
    }
    if (sessions.some((session) => session.date === selectedDate && session.time === selectedTime)) {
      setScheduleError("This date and time is already in your package.");
      return;
    }
    if (sessions.length >= requiredLessons) return;
    setSessions((previous) => [...previous, { date: selectedDate, time: selectedTime }]);
    setRequestSent(false);
    setSelectedDate("");
    setSelectedTime("");
    setScheduleError("");
  }

  async function handleTriggerBookingRequest() {
    if (requesting) return;
    if (!availabilityReady) { setScheduleError('Please wait for availability to load.'); return; }
    if (!selectedRate?.durationMinutes) { setScheduleError("The coach must confirm the lesson duration in this package before it can be booked."); return; }
    if (!selectedRate || !requiredLessons || sessions.length !== requiredLessons) {
      setScheduleError(`Select all ${requiredLessons || "required"} lesson dates and times before requesting your booking.`);
      return;
    }
    if (sessions.some((session) => new Date(`${session.date}T${session.time}`) <= new Date() || confirmedBookingDates.has(session.date))) {
      setScheduleError("A selected lesson is no longer available. Remove it and choose another date and time.");
      return;
    }
    setRequesting(true);
    try {
    const saved = await onRequestBooking({
      coachId: user.id,
      category: selectedRate.category,
      packSize: selectedRate.packSize,
      coachName: user.name,
      sessions: [...sessions].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)),
      rate: selectedRate.formattedRate,
      package: selectedRate.category.replace(/_/g, " ") + " (" + selectedRate.packSize.replace(/_/g, " ") + ")"
    });
    if (!saved) return;
    setSessions([]);
    setSelectedDate("");
    setSelectedTime("");
    setScheduleError("");
    setRequestSent(true);
    } catch {
      setScheduleError("Unable to send your booking request. Please try again.");
    } finally { setRequesting(false); }
  }

  return (
    <div className="profile-layout-container">
      <InlineFeedback message={feedback} onDismiss={() => setFeedback("")} />
      <div className="profile-header-card">
        <div className="profile-monogram">
          {user.profileImage ? (
            <img src={user.profileImage} alt={`${user.name || "Coach"} profile`} />
          ) : <span aria-hidden="true">{user.name ? user.name.charAt(0).toUpperCase() : "W"}</span>}
        </div>

        <div className="coach-header-text profile-summary">
          <div className="profile-title-row coach-name-row">
              <h2>
                {user.name}
                {user.isVerified && <CheckCircleIcon className="verified-check" titleAccess="Verified profile" />}
              </h2>
            <div className="rating-row" aria-label={hasRating ? `${rating.toFixed(1)} out of 5 stars` : "No ratings yet"}>
              {hasRating ? (
                <>
                  {Array.from({ length: 5 }).map(function(_, i) {
                    return <StarIcon key={i} className="star-ui-element" />;
                  })}
                  <span>{rating.toFixed(1)} · {user.reviews.length} {user.reviews.length === 1 ? 'review' : 'reviews'}</span>
                </>
              ) : <span>No ratings yet</span>}
            </div>
          </div>
          <h3>{user.title || "Golf coach"}</h3>
          {user.isVerified && <span className="verification-badge">Verified</span>}
          <div className="profile-meta-row"><span>{user.location || "Location pending"}</span></div>

          {isOwnProfile ? (
            isEditing ? (
              <div className="inline-editor-box">
                <label className="coach-title-editor">Professional title<input type="text" value={editTitle} maxLength={120} required placeholder="e.g. PGA golf coach" onChange={e=>setEditTitle(e.target.value)} /></label>
                <textarea value={editBio} onChange={function(e) { setEditBio(e.target.value); }} className="edit-textarea" />
                <div className="coach-photo-requirement">
                  <h4>Profile photo</h4>
                  <p>{user.profileImage ? "Choose a new image to replace your current profile photo." : "Upload a clear photo of yourself for your profile."}</p>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setEditProfilePhoto(e.target.files[0] || null)} />
                </div>
                <div className="rate-template-builder-box coach-package-editor">
                  <h4>Packages and lesson rates</h4>
                  <p>Enable the packages you offer, then set the total price and duration of each lesson.</p>
                  {LESSON_CATEGORIES.map(category => <section className="package-editor-category" key={category.value}>
                  <h5>{category.label.replace(' (60 mins)', '')}</h5>
                  <div className="rate-options-list">
                    {RATE_OPTIONS.filter(option=>option.category===category.value).map((option) => {
                      const isSelected = Object.prototype.hasOwnProperty.call(editableRates, option.id);
                      return (
                        <div className={`rate-option-row${isSelected ? " has-rate" : ""}`} key={option.id}>
                          <label className="package-editor-toggle">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleRateOption(option.id)} />
                            <span><strong>{option.packSize==='single'?'Single lesson':option.packSize==='pack_5'?'5-lesson pack':'10-lesson pack'}</strong><small>{option.packSize==='single'?'1 lesson':'Valid for 3 months'}</small></span>
                          </label>
                          {isSelected && <div className="package-editor-fields">
                            <label>Total price (ZAR)<input type="number" min="0" step="0.01" placeholder="e.g. 600" aria-label={`${option.label} total price in ZAR`} value={editableRates[option.id]} onChange={(e) => setEditableRates((previous) => ({ ...previous, [option.id]: e.target.value }))} /></label>
                            <label>Lesson length (min)<input type="number" min="5" max="480" step="1" placeholder="e.g. 60" aria-label={`${option.label} minutes per lesson`} value={durations[option.id] || ''} onChange={e=>setDurations(prev=>({...prev,[option.id]:e.target.value}))} required /></label>
                          </div>}
                        </div>
                      );
                    })}
                  </div>
                  </section>)}
                </div>
                <div className="editor-controls">
                  <button className="btn-primary" onClick={handleSaveEdits}>Commit Changes</button>
                  <button className="btn-secondary" onClick={function() { setIsEditing(false); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="bio-display-row">
                <p className="coach-bio-paragraph">{user.bio}</p>
                <button className="btn-edit-toggle" onClick={startEditing}>Edit profile</button>
              </div>
            )
          ) : (
            <p className="coach-bio-paragraph">{user.bio}</p>
          )}
        </div>
      </div>

      <div className="profile-split-row">
        <div className="rates-packages-block">
          <h3>Customized Packages and Lesson Rates</h3>
          {offeredRates.length > 0 ? (
            <div className="package-rates-grid">
              {offeredRates.map((offering) => (
                <div className="package-matrix-template-view" key={`${offering.category}-${offering.packSize}`}>
                  <div className="matrix-tier-header">
                    <h4>{offering.category.replace(/_/g, " · ").toUpperCase()}</h4>
                  </div>
                  <div className="matrix-tier-body">
                    <span className="pack-size-label">{offering.packSize.replace(/_/g, " ").toUpperCase()}</span>
                    <p className="price-tag-large">{offering.formattedRate}</p><p>{offering.durationMinutes ? `${offering.durationMinutes} minutes per lesson` : "Lesson duration awaiting coach confirmation"}</p>
                    {!isOwnProfile && (
                      <button type="button" className="btn-primary package-select-button"
                        disabled={requesting}
                        onClick={() => selectPackage(offering)}>
                        {selectedPackage === `${offering.category}-${offering.packSize}` ? "Selected · choose dates" : "Select package"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="empty-fallback-notification">This coach has not listed lesson rates yet.</p>}

          <div className="platform-policies-container-card">
            <h4>Lesson Registration Policies</h4>
            <ul className="policy-bullet-strings">
              <li>All lessons are payment upfront for the month and must be settled before lessons start.</li>
              <li>Please ensure there is 24 hours notice provided before cancelling a scheduled lesson slot.</li>
              <li>All lesson packages exclude tracking bucket materials which remain separate terminal bills.</li>
            </ul>
          </div>

          {isOwnProfile && (
            <BookingList key={bookingTarget?.key || 'bookings'} initialBookingId={bookingTarget?.target_id} bookings={bookings} user={user} isCoach onChanged={onBookingChanged} onCoachAction={onCoachAction} onMessageInit={onMessageInit} />
          )}
        </div>

        <div className="availability-calendar-block" ref={calendarRef} tabIndex={-1}>
            <div className="booking-calendar-title-row">
            <h3><CalendarMonthIcon /> {isOwnProfile ? "Your Booking Calendar" : "Schedule your lessons"}</h3>
            {!isOwnProfile && <ol className="booking-steps" aria-label="Booking steps">
                <li className={selectedRate ? 'is-complete' : 'is-current'}><span>1</span> Choose package</li>
                <li className={selectedRate && sessions.length < requiredLessons ? 'is-current' : ''}><span>2</span> Add lesson dates</li>
                <li className={requiredLessons && sessions.length === requiredLessons ? 'is-current' : ''}><span>3</span> Review & request</li>
              </ol>}
            {availabilityReady && <span className="calendar-booked-days">{[...confirmedBookingDates].filter(d => d.startsWith(String(calendarYear))).length} booked {confirmedBookingDates.size === 1 ? 'day' : 'days'} in {calendarYear}</span>}
            </div>
            {!isOwnProfile && <>
              <label className="booking-package-picker">Your package
                <select value={selectedPackage} disabled={requesting} onChange={e => { const offer = offeredRates.find(r => `${r.category}-${r.packSize}` === e.target.value); if (offer) selectPackage(offer); }}>
                  <option value="" disabled>Choose a lesson package</option>
                  {offeredRates.map(r => <option key={`${r.category}-${r.packSize}`} value={`${r.category}-${r.packSize}`}>{r.category.replaceAll('_', ' ')} · {r.packSize.replaceAll('_', ' ')} · {r.formattedRate}</option>)}
                </select>
                {selectedRate && <small>{selectedRate.durationMinutes ? `${selectedRate.durationMinutes} minutes per lesson` : 'Awaiting lesson duration from coach'} · {requiredLessons} {requiredLessons === 1 ? 'lesson' : 'lessons'}</small>}
                {selectedRate && <small>Request your dates, then pay after coach approval.</small>}
              </label>
              {requestSent && <p className="booking-success" role="status">✓ Request sent. Your coach will review your dates. You can pay once they approve.</p>}
            </>}
            <div className="booking-calendar-legend"><span><i className="legend-open" /> Available</span><span><i className="legend-booked" /> Booked</span>{!isOwnProfile && <span><i className="legend-selected" /> Your selection</span>}</div>
            {!availabilityReady && <p role="status">{availability.coachId === user.id && availability.status === 'error' ? 'Unable to load availability. Retrying shortly…' : 'Loading coach availability…'}</p>}

            <div className="calendar-heatmap-layout">
              <div className="calendar-grid-scroll">
                <div className="calendar-grid-content">
                  <div className="calendar-month-labels" aria-hidden="true">
                    {calendarMonths.map((month) => (
                      <span key={`${month.label}-${month.week}`} style={{ gridColumnStart: month.week }}>{month.label}</span>
                    ))}
                  </div>
                  <div className="calendar-weekday-labels" aria-hidden="true">
                    <span>Mon</span>
                    <span>Wed</span>
                    <span>Fri</span>
                  </div>
                  <div className="github-tracker-grid" aria-busy={!availabilityReady} aria-label={`Coach booking calendar for ${calendarYear}`}>
                    {calendarDays.map(function(day, index) {
                      if (!day) return <span className="calendar-cell calendar-cell-placeholder" key={`blank-${index}`} aria-hidden="true" />;
                      return (
                        <button
                          type="button"
                          key={day.dateString}
                          className={"calendar-cell " + (day.isBooked ? "cell-booked" : "cell-open") + " " + (selectedDate === day.dateString || sessions.some((session) => session.date === day.dateString) ? "cell-selected" : "")}
                          onClick={function() { if (!day.isBooked && !isOwnProfile) setSelectedDate(day.dateString); }}
                          disabled={day.isBooked || isOwnProfile || requesting || !availabilityReady || !selectedRate || sessions.length >= requiredLessons || new Date(`${day.dateString}T23:59:59`) < new Date()}
                          title={`${day.dateString}: ${day.isBooked ? "Confirmed booking" : "Available"}`}
                          aria-label={`${day.dateString}: ${day.isBooked ? "Confirmed booking" : "Available"}`}
                          aria-pressed={selectedDate === day.dateString || sessions.some(s => s.date === day.dateString)}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="calendar-year-tabs" aria-label="Calendar year">
                {[currentYear, currentYear + 1].map((year) => (
                  <button
                    type="button"
                    key={year}
                    className={calendarYear === year ? "active" : ""}
                    aria-pressed={calendarYear === year}
                    disabled={requesting}
                    onClick={() => { setCalendarYear(year); setSelectedDate(""); }}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>

            {!isOwnProfile && (
              <div className="booking-planner">
                <div className="booking-date-panel">
                <h4>{sessions.length === requiredLessons && requiredLessons ? 'Your dates are ready' : `Choose lesson ${sessions.length + 1}${requiredLessons ? ` of ${requiredLessons}` : ''}`}</h4>
                <p>Click a square above or use the date picker below. All times are South African time (SAST).</p>
                <fieldset disabled={!selectedRate || !availabilityReady || requesting || sessions.length >= requiredLessons}>
                <div className="timeline-input-verification-block">
                  <label>Lesson date
                  <input type="date" value={selectedDate} min={today} max={`${currentYear + 1}-12-31`} onChange={e => { setSelectedDate(e.target.value); if(e.target.value) setCalendarYear(Number(e.target.value.slice(0,4))); setScheduleError(''); }} />
                  </label>
                  <label>Lesson time
                  <input type="time" value={selectedTime} onChange={function(e) { setSelectedTime(e.target.value); }} disabled={!selectedRate || sessions.length >= requiredLessons} required />
                  </label>
                </div>
                <button type="button" className="btn-secondary add-lesson-button" onClick={addSession} disabled={!selectedRate || !selectedDate || !selectedTime || sessions.length >= requiredLessons}>Add lesson{requiredLessons ? ` (${sessions.length}/${requiredLessons})` : ""}</button>
                </fieldset>
                {scheduleError && <p className="booking-error" role="alert">{scheduleError}</p>}
                </div>
                <aside className="booking-request-summary" aria-label="Booking summary">
                <h4>Your lesson plan <span>{sessions.length}/{requiredLessons || '–'}</span></h4>
                <progress value={sessions.length} max={requiredLessons || 1} aria-label="Lessons selected" />
                {!sessions.length && <p className="booking-empty-plan">Your selected lessons will appear here. Add a date and time to start your plan.</p>}
                {sessions.length > 0 && <ol className="selected-lessons">
                  {sessions.map((session, index) => <li key={`${session.date}-${session.time}`}>
                    <span><small>Lesson {index + 1}</small><strong>{formatLessonDate(session.date)}</strong><span>{session.time} · {selectedRate?.durationMinutes} min</span></span>
                    <button type="button" disabled={requesting} className="booking-remove" aria-label={`Remove lesson ${index + 1}`} onClick={() => { setSessions((previous) => previous.filter((_, i) => i !== index)); setScheduleError(""); }}>Remove</button>
                  </li>)}
                </ol>}

                <div className="booking-total"><span>Package total</span><strong>{selectedRate?.formattedRate || '—'}</strong></div>
                <p className="booking-next-step">{selectedRate && sessions.length < requiredLessons ? `Add ${requiredLessons - sessions.length} more ${requiredLessons - sessions.length === 1 ? 'lesson' : 'lessons'} to continue.` : 'Your coach approves the dates before payment.'}</p>
                <div className="action-buttons-row">
                  <button className="btn-primary" disabled={requesting || !availabilityReady || !selectedRate?.durationMinutes || !requiredLessons || sessions.length !== requiredLessons} onClick={handleTriggerBookingRequest}>{requesting ? 'Sending request…' : 'Request booking'}</button>
                  <button className="btn-secondary" onClick={function() { onMessageInit(user.id, user.name); }}><MessageIcon /> Message coach</button>
                </div>
                </aside>
              </div>
            )}
          </div>
      </div>

      <ProfileReviews user={user} />
      {qualifications.length > 0 && <div className="credentials-block-footer">
        <h3>Qualifications Portfolio</h3>
        <ul className="qualifications-bullet-list">
          {qualifications.map(function(qual, i) {
            return <li key={i}>{qual}</li>;
          })}
        </ul>
      </div>}
    </div>
  );
}

export default CoachProfile;
