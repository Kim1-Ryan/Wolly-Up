import InlineFeedback from "./InlineFeedback";
import React, { useState } from "react";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";

function ReviewForm({ coachId, coachName, onSubmitReview, onCancel }) {
  const [feedback, setFeedback] = useState("");

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (rating === 0 || !reviewText.trim()) {
      setFeedback("Validation Error: All evaluation fields are compulsory.");
      return;
    }
    onSubmitReview({
      id: "REV-" + Date.now(),
      coachId: coachId,
      rating: rating,
      text: reviewText.trim(),
      timestamp: new Date().toLocaleDateString("en-ZA")
    });
    setRating(0);
    setReviewText("");
  }

  return (
    <div className="review-form-card">
      <InlineFeedback message={feedback} onDismiss={() => setFeedback("")} />
      <h4>Submit Lesson Review for: {coachName}</h4>
      <form onSubmit={handleSubmit}>
        <div className="star-rating-picker-row">
          <div className="interactive-stars-wrapper">
            {[1, 2, 3, 4, 5].map((starIdx) => (
              <span 
                key={starIdx} 
                onClick={function() { setRating(starIdx); }}
                onMouseEnter={function() { setHoverHoverRating(starIdx); }}
                onMouseLeave={function() { setHoverHoverRating(0); }}
                className="interactive-star-node"
              >
                {starIdx <= (hoverRating || rating) ? <StarIcon className="star-active" /> : <StarBorderIcon className="star-inactive" />}
              </span>
            ))}
          </div>
        </div>
        <div className="review-input-group">
          <textarea value={reviewText} onChange={function(e) { setReviewText(e.target.value); }} placeholder="Describe your experience..." rows="4" required />
        </div>
        <div className="editor-controls">
          <button type="submit" className="btn-primary">Publish Review</button>
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default ReviewForm;
