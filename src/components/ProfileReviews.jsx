import './ProfileReviews.css';

export default function ProfileReviews({ user }) {
  const reviews = user.reviews || [];
  return <section className="profile-reviews" aria-label="Lesson ratings and reviews">
    <div className="profile-reviews-heading"><h3>Lesson reviews</h3><span>{reviews.length ? `${Number(user.rating).toFixed(1)} · ${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}</span></div>
    {!reviews.length && <p>Ratings appear here after a completed lesson is reviewed.</p>}
    {reviews.map((review, index) => <article className="profile-review" key={`${review.createdAt}-${index}`}>
      <div><strong>{review.authorName}</strong><span aria-label={`${review.rating} out of 5 stars`} className="profile-review-stars">{'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</span></div>
      {review.comment && <p>{review.comment}</p>}
      <div className="profile-review-footer"><small>{new Date(review.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</small>{review.package&&<small className="profile-review-package">{review.package.replaceAll('_', ' ').replace(/\b(adult|junior)\s+(individual|group)\b/gi, '$1 · $2')}</small>}</div>
    </article>)}
  </section>;
}
