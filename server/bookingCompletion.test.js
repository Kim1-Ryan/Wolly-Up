import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLessonCompleted, isBookingCompleted } from '../src/components/bookingCompletion.js';

const first = { date: '2026-10-12', time: '16:15' };
const second = { date: '2026-10-26', time: '14:23' };
const review = (userId, session) => ({ userId, slot: `${session.date}T${session.time}` });

test('elapsed or one-sided lessons remain active until both participants confirm', () => {
  const booking = { learnerId: 'learner', coachId: 'coach', sessions: [first], feedback: [] };
  assert.equal(isLessonCompleted(booking, first), false);
  booking.feedback.push(review('learner', first));
  assert.equal(isBookingCompleted(booking), false);
  booking.feedback.push(review('coach', first));
  assert.equal(isBookingCompleted(booking), true);
});

test('completed lessons in a partially finished package archive individually', () => {
  const booking = { learnerId: 'learner', coachId: 'coach', sessions: [first, second],
    feedback: [review('learner', first), review('coach', first)] };
  assert.equal(isLessonCompleted(booking, first), true);
  assert.equal(isLessonCompleted(booking, second), false);
  assert.equal(isBookingCompleted(booking), false);
  booking.feedback.push(review('learner', second), review('coach', second));
  assert.equal(isBookingCompleted(booking), true);
});

test('empty packages are not completed', () => {
  assert.equal(isBookingCompleted({ sessions: [] }), false);
});
