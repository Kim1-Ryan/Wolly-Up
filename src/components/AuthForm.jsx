import { apiFetch } from '../api';
import InlineFeedback from "./InlineFeedback";
import { validityOptions, validityLabel } from '../packages';
import './AccountSettings.css';
import React, { useState, useEffect } from "react";

const LESSON_CATEGORIES = [
  { value: "junior_individual", label: "Junior Individual Lessons (60 mins)" },
  { value: "adult_individual", label: "Adult Individual Lessons (60 mins)" },
  { value: "adult_group", label: "Adult Group Lessons (3–6 people)" }
];

const PACKAGE_OPTIONS = [
  { value: "single", label: "1 lesson" },
  { value: "pack_5", label: "5 lessons" },
  { value: "pack_10", label: "10 lessons" }
];

const RATE_OPTIONS = LESSON_CATEGORIES.flatMap((category) =>
  PACKAGE_OPTIONS.map((pack) => ({
    id: `${category.value}_${pack.value}`,
    category: category.value,
    packSize: pack.value,
    label: `${category.label}: ${pack.label}`
  }))
);

function AuthForm({ onAuthSuccess }) {
  const [feedback, setFeedback] = useState("");

  const [isLoginMode, setIsLoginMode] = useState(()=>!new URLSearchParams(window.location.search).get('ref'));
  const [referralCode,setReferralCode] = useState(()=>(new URLSearchParams(window.location.search).get('ref') || '').trim().toLowerCase());
  const [marketingEmails,setMarketingEmails] = useState(false);
  const [role, setRole] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    location: "",
    bio: "",
    dob: "",
    expertise: "",
    title: ""
  });
  const [selectedRates, setSelectedRates] = useState({});
  const [durations, setDurations] = useState({});
  const [packageValidityMonths, setPackageValidityMonths] = useState({});

  const [profilePhoto, setProfilePhoto] = useState(null);
  const [profilePhotoConfirmed, setProfilePhotoConfirmed] = useState(false);

  useEffect(() => {
    if (isLoginMode) {
      return;
    }

    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        const url =
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;

        apiFetch(url)
          .then((res) => res.json())
          .then((data) => {
            if (data && data.address) {
              const city =
                data.address.city ||
                data.address.town ||
                data.address.village ||
                data.address.suburb ||
                "";

              const country = data.address.country || "";

              const displayLoc =
                city && country
                  ? `${city}, ${country}`
                  : country;

              setFormData((prev) => ({
                ...prev,
                location: displayLoc
              }));
            }
          })
          .catch(() => {
            setFormData((prev) => ({
              ...prev,
              location: ""
            }));
          });
      },
      () => {
        setFormData((prev) => ({
          ...prev,
          location: ""
        }));
      }
    );
  }, [isLoginMode]);

  function handleInputChange(e) {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  }

  function toggleRateOption(optionId) {
    setSelectedRates((previous) => {
      const next = { ...previous };
      if (next[optionId] !== undefined) {
        delete next[optionId];
      } else {
        next[optionId] = "";
      }
      return next;
    });
  }

  function changeRate(optionId, value) {
    setSelectedRates((previous) => ({ ...previous, [optionId]: value }));
  }

  function calculateAge(birthDateString) {
    const today = new Date();
    const birthDate = new Date(birthDateString);

    let calculatedAge =
      today.getFullYear() - birthDate.getFullYear();

    const monthDifference =
      today.getMonth() - birthDate.getMonth();

    if (
      monthDifference < 0 ||
      (
        monthDifference === 0 &&
        today.getDate() < birthDate.getDate()
      )
    ) {
      calculatedAge--;
    }

    return calculatedAge;
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("The image could not be read."));
      reader.readAsDataURL(file);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (formData.password.length < 6) {
      setFeedback("Password must be at least 6 characters long.");
      return;
    }

    if (isLoginMode) {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, password: formData.password })
      });
      const profile = await response.json();
      if (!response.ok) {
        setFeedback(profile.error || "Unable to log in.");
        return;
      }
      onAuthSuccess(profile);
      return;
    }

    if (!role) {
      setFeedback("Please select whether you are a learner or coach.");
      return;
    }

    if (!formData.dob) {
      setFeedback("Please enter your date of birth.");
      return;
    }

    const age = calculateAge(formData.dob);

    if (age < 18) {
      setFeedback("You must be at least 18 years old to register.");
      return;
    }

    if (role === "coach") {
      if (!formData.title) {
        setFeedback("Please enter your professional title.");
        return;
      }

      if (!profilePhoto) {
        setFeedback("Coaches must upload a clear profile photo of themselves for their public profile.");
        return;
      }

      if (!profilePhotoConfirmed) {
        setFeedback("Please confirm that your profile photo is a clear photo of yourself.");
        return;
      }

      if (!profilePhoto.type.startsWith("image/") || profilePhoto.size > 5 * 1024 * 1024) {
        setFeedback("Your profile photo must be an image smaller than 5 MB.");
        return;
      }

      const selectedOfferings = RATE_OPTIONS.filter((option) =>
        Object.prototype.hasOwnProperty.call(selectedRates, option.id)
      );
      if (selectedOfferings.length === 0) {
        setFeedback("Please select at least one lesson option to offer.");
        return;
      }
      if (selectedOfferings.some((option) => !selectedRates[option.id] || Number(selectedRates[option.id]) < 0)) {
        setFeedback("Please enter a valid rate for every selected lesson option.");
        return;
      }
    }

    if (role === "learner" && !formData.expertise) {
      setFeedback("Please select your experience level.");
      return;
    }

    let profileImage = null;
    if (profilePhoto && (!['image/jpeg', 'image/png', 'image/webp'].includes(profilePhoto.type) || profilePhoto.size > 5 * 1024 * 1024)) {
      setFeedback('Choose a JPG, PNG, or WebP profile photo smaller than 5 MB.'); return;
    }
    try {
      profileImage = profilePhoto ? await readImageFile(profilePhoto) : null;
    } catch {
      setFeedback("Your profile photo could not be read. Please choose another image.");
      return;
    }

    const registrationData = {
      ...formData,
      role,
      age,
      offerings: role === "coach"
        ? RATE_OPTIONS
          .filter((option) => Object.prototype.hasOwnProperty.call(selectedRates, option.id))
          .map((option) => ({
            category: option.category,
            packSize: option.packSize,
            rate: Number(selectedRates[option.id]),
            durationMinutes: Number(durations[option.id]),
            validityMonths: Number(packageValidityMonths[option.id] ?? 3)
          }))
        : [],
      profileImage,
      profilePhotoConfirmed,
      referralCode:referralCode.trim().toLowerCase() || undefined,
      marketingEmails
    };

    const response = await apiFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registrationData)
    });
    const profile = await response.json();
    if (!response.ok) {
      setFeedback(profile.error || "Unable to create your account.");
      return;
    }
    onAuthSuccess(profile);
  }

  return (
    <section className="auth-card">
      <InlineFeedback message={feedback} onDismiss={() => setFeedback("")} />

      <h2>
        {isLoginMode
          ? "Welcome back"
          : "Create your account"}
      </h2>

      <p className="auth-intro">
        {isLoginMode
          ? "Sign in to continue your Wolly Up journey."
          : "Join Wolly Up as a learner or coach."}
      </p>

      {!isLoginMode && (
        <div className="role-selector">

          <button
            type="button"
            className={
              role === "learner"
                ? "active"
                : ""
            }
            onClick={() => setRole("learner")}
          >
            Learner
          </button>

          <button
            type="button"
            className={
              role === "coach"
                ? "active"
                : ""
            }
            onClick={() => setRole("coach")}
          >
            Coach
          </button>

        </div>
      )}

      <form onSubmit={handleSubmit}>

        {!isLoginMode && (
          <input
            type="text"
            name="name"
            placeholder="Full name"
            value={formData.name}
            onChange={handleInputChange}
            required
          />
        )}

        <input
          type="email"
          name="email"
          placeholder="Email address"
          value={formData.email}
          onChange={handleInputChange}
          required
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleInputChange}
          required
        />

        {!isLoginMode && (
          <>
            <input
              type="text"
              name="location"
              placeholder="Location"
              value={formData.location}
              readOnly
              required
            />

            <textarea
              name="bio"
              placeholder="A little about you"
              value={formData.bio}
              onChange={handleInputChange}
              required
            />

            <div className="verification-row">

              <label>
                Date of birth
              </label>

              <input
                type="date"
                name="dob"
                value={formData.dob}
                onChange={handleInputChange}
                required
              />

            </div>

            {role === "learner" && (
              <select
                name="expertise"
                value={formData.expertise}
                onChange={handleInputChange}
                required
              >
                <option value="">
                  Select your experience level
                </option>

                <option value="beginner">
                  Beginner
                </option>

                <option value="intermediate">
                  Intermediate
                </option>

                <option value="advanced">
                  Advanced
                </option>
              </select>
            )}

            {role === 'learner' && <div className="coach-photo-requirement"><h4>Profile photo (optional)</h4><p>Add a photo, or we’ll display your initials.</p><input type="file" aria-label="Profile photo (optional)" accept="image/jpeg,image/png,image/webp" onChange={e=>setProfilePhoto(e.target.files[0] || null)} /></div>}
            {role === "coach" && (
              <>
                <input
                  type="text"
                  name="title"
                  placeholder="Professional title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                />

                <div className="coach-photo-requirement">
                  <h4>Coach profile photo required</h4>
                  <p>Upload a clear, front-facing photo of yourself. Identity verification is completed separately through Persona.</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setProfilePhoto(e.target.files[0] || null)}
                    required
                  />
                  <label className="photo-confirmation">
                    <input
                      type="checkbox"
                      checked={profilePhotoConfirmed}
                      onChange={(e) => setProfilePhotoConfirmed(e.target.checked)}
                      required
                    />
                    I confirm this is a clear, current photo of me.
                  </label>
                </div>

                <div className="rate-template-builder-box">

                  <h4>Lesson options and rates</h4>
                  <p>Select every option you offer, then set its price in ZAR. Unselected options will not appear on your profile.</p>

                  <div className="rate-options-list">
                    {RATE_OPTIONS.map((option) => {
                      const isSelected = Object.prototype.hasOwnProperty.call(selectedRates, option.id);
                      return (
                        <div className={`rate-option-row${isSelected ? " has-rate" : ""}`} key={option.id}>
                          <label>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRateOption(option.id)}
                            />
                            <span>{option.label}</span>
                          </label>
                          {isSelected && (
                            <input
                              type="number"
                              aria-label={`Rate for ${option.label}`}
                              placeholder="Price, e.g. 600"
                              value={selectedRates[option.id]}
                              onChange={(e) => changeRate(option.id, e.target.value)}
                              min="0"
                              step="0.01"
                              required
                            />
                          )}
                          {isSelected && <label>Minutes per lesson<input type="number" min="5" max="480" step="1" value={durations[option.id] || ''} onChange={e=>setDurations(prev=>({...prev,[option.id]:e.target.value}))} required /></label>}
                          {isSelected && <label>Validity period<select value={packageValidityMonths[option.id] ?? 3} onChange={e=>setPackageValidityMonths(previous=>({...previous,[option.id]:Number(e.target.value)}))}>{validityOptions(option.packSize).map(months=><option key={months} value={months}>{validityLabel(months)}</option>)}</select></label>}
                        </div>
                      );
                    })}
                  </div>

                </div>
              </>
            )}

            <div className="secure-verification-box"><h4>Identity verification</h4><p>After creating your account, verify your identity securely with Persona.</p></div>
            <div className="signup-preferences">
              <label>Referral code (optional)<input type="text" maxLength={32} value={referralCode} onChange={event=>setReferralCode(event.target.value)} placeholder="From a friend’s referral link"/><small>Sign up with a friend’s link to receive 5 free tokens. They earn 10 tokens.</small></label>
              <label className="account-checkbox"><input type="checkbox" checked={marketingEmails} onChange={event=>setMarketingEmails(event.target.checked)}/> Email me offers, news and marketing updates.</label>
              <p>Optional. Unsubscribe anytime from your profile or an email link. Important account, security, data and booking emails remain enabled.</p>
            </div>
          </>
        )}

        <button
          type="submit"
          className="auth-btn"
        >
          {isLoginMode
            ? "Log in"
            : "Create account"}
        </button>

        <button
          type="button"
          className="toggle-btn"
          onClick={() =>
            setIsLoginMode(!isLoginMode)
          }
        >
          {isLoginMode
            ? "Create an account"
            : "Back to login"}
        </button>

      </form>
    </section>
  );
}

export default AuthForm;
