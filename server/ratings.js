export function rankProfiles(profiles) {
  return [...profiles].sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0)
    || (b.reviewCount||0)-(a.reviewCount||0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export async function profileRatings(pool, profileId) {
  const result = await pool.query(`SELECT f.rating, f.comment, f.created_at AS "createdAt", p.name AS "authorName",
    b.details->>'package' AS package
    FROM lesson_feedback f JOIN bookings b ON b.id=f.booking_id
    JOIN profiles p ON p.id=f.user_id
    WHERE (b.learner_id=$1 AND f.user_id=b.coach_id)
       OR (b.coach_id=$1 AND f.user_id=b.learner_id)
    ORDER BY f.created_at DESC`, [profileId]);
  const reviews = result.rows;
  return { reviews, reviewCount: reviews.length,
    rating: reviews.length ? reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length : null };
}
