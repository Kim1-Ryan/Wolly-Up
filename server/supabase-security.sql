-- The application accesses Postgres through its private server connection.
-- Do not expose account/session/booking tables through the public Data API.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['profiles','listings','bookings','lesson_feedback',
    'conversations','messages','booking_venue_log','notification_reads','account_sessions','token_transactions',
    'email_contacts','referral_redemptions','account_deletions','email_outbox']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
  END LOOP;
END $$;
