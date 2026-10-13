export function isLessonCompleted(booking, session) {
  const slot = `${session.date}T${session.time}`;
  return [booking.learnerId, booking.coachId].every(id => id &&
    (booking.feedback || []).some(review => review.userId === id && review.slot === slot));
}

export function isBookingCompleted(booking) {
  return booking.sessions?.length > 0 && booking.sessions.every(session => isLessonCompleted(booking, session));
}
