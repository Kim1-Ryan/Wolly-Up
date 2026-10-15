ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE profiles ALTER COLUMN referral_code SET DEFAULT replace(gen_random_uuid()::text, '-', '');
UPDATE profiles SET referral_code=replace(id::text, '-', '') WHERE referral_code IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique ON profiles(referral_code);

CREATE TABLE IF NOT EXISTS email_contacts (
 user_id UUID PRIMARY KEY REFERENCES profiles(id),
 email TEXT NOT NULL,
 marketing_subscribed BOOLEAN NOT NULL DEFAULT FALSE,
 unsubscribe_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO email_contacts(user_id,email) SELECT id,email FROM profiles WHERE deleted_at IS NULL ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS referral_redemptions (
 email_hash TEXT PRIMARY KEY,
 referrer_id UUID NOT NULL REFERENCES profiles(id),
 referred_id UUID NOT NULL UNIQUE REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS account_deletions (
 id UUID PRIMARY KEY, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS email_outbox (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES profiles(id),
 kind TEXT NOT NULL CHECK(kind IN ('welcome','account','marketing')),
 event_key TEXT NOT NULL UNIQUE, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','suppressed')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_outbox_pending ON email_outbox(next_attempt_at) WHERE status IN ('pending','sending');
