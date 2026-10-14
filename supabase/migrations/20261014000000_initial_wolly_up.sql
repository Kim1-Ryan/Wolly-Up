-- Initial schema for the current Wolly Up application.
;

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('learner', 'coach')),
  location TEXT,
  bio TEXT,
  age INTEGER,
  expertise TEXT,
  title TEXT,
  profile_image TEXT,
  rates_structure JSONB,
  qualifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Treat email addresses as case-insensitive, even when records are added outside the API.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lowercase_unique
  ON profiles (LOWER(email));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_image TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rates_structure JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS qualifications JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  price NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES profiles(id),
  coach_id UUID NOT NULL REFERENCES profiles(id),
  details JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_coach_approval',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

;


ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona_inquiry_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona_status TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona_environment TEXT;
CREATE TABLE IF NOT EXISTS account_sessions (
 token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES profiles(id),
 expires_at TIMESTAMPTZ NOT NULL
);
;

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES profiles(id),
  coach_id UUID NOT NULL REFERENCES profiles(id),
  details JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_coach_approval',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS change_request JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS change_log JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS lesson_feedback (
 booking_id UUID NOT NULL REFERENCES bookings(id), user_id UUID NOT NULL REFERENCES profiles(id),
 slot TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(booking_id,user_id,slot)
)
;


CREATE TABLE IF NOT EXISTS conversations (
 id UUID PRIMARY KEY, first_id UUID NOT NULL REFERENCES profiles(id),
 second_id UUID NOT NULL REFERENCES profiles(id), UNIQUE(first_id, second_id)
);
CREATE TABLE IF NOT EXISTS messages (
 id UUID PRIMARY KEY, room_id UUID NOT NULL REFERENCES conversations(id),
 sender_id UUID NOT NULL REFERENCES profiles(id), text TEXT NOT NULL,
 location JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS venue_status TEXT;
CREATE TABLE IF NOT EXISTS booking_venue_log (
 id UUID PRIMARY KEY, booking_id UUID NOT NULL REFERENCES bookings(id),
 message_id UUID UNIQUE NOT NULL REFERENCES messages(id),
 accepted_by UUID NOT NULL REFERENCES profiles(id), location JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notification_reads (
 user_id UUID NOT NULL REFERENCES profiles(id), notification_id TEXT NOT NULL,
 PRIMARY KEY(user_id, notification_id)
);
;

ALTER TABLE listings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS offer JSONB;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
UPDATE listings l SET status='pending_fee_configuration' FROM profiles p
 WHERE p.id=l.author_id AND p.role='coach' AND l.offer IS NULL AND l.status='active';
;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS token_balance INTEGER NOT NULL DEFAULT 0 CHECK(token_balance>=0);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS paid_listing_count INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS token_transactions (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES profiles(id), amount INTEGER NOT NULL,
 listing_id UUID REFERENCES listings(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS tokens_spent INTEGER NOT NULL DEFAULT 0;
;

-- The application accesses Postgres through its private server connection.
-- Do not expose account/session/booking tables through the public Data API.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['profiles','listings','bookings','lesson_feedback',
    'conversations','messages','booking_venue_log','notification_reads','account_sessions','token_transactions']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
  END LOOP;
END $$;
