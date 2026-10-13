import Rating from '@mui/material/Rating';
import './LearnerRating.css';

export default function LearnerRating({ user }) {
  const count = user.reviewCount ?? user.reviews?.length ?? 0;
  const rating = Number(user.rating);
  const hasRating = count > 0 && Number.isFinite(rating) && rating > 0;
  return <div className="learner-overall-rating">
    <div className="learner-rating-value">
      <Rating value={hasRating ? rating : 0} precision={0.1} readOnly size="small" getLabelText={value => `${value} out of 5 stars`} />
      <span>{hasRating ? <><strong>{rating.toFixed(1)}</strong><span className="learner-rating-count"> · {count} {count === 1 ? 'review' : 'reviews'}</span></> : 'No ratings yet'}</span>
    </div>
  </div>;
}
