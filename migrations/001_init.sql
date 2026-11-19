-- Self-hosted psychology experiment platform: initial schema.
-- RESEARCH tables (retained, de-identified): participants, allocations, audio_versions, audio_events
-- OPERATIONAL tables (temporary / purgeable): participant_sessions, admin_sessions, admin_login_tokens
-- ADMIN tables: settings, admin_audit

CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

CREATE TABLE audio_versions (
  id                SERIAL PRIMARY KEY,
  slot              text NOT NULL CHECK (slot IN ('crowd','brown')),
  original_filename text NOT NULL,
  stored_filename   text NOT NULL UNIQUE,
  mime_type         text NOT NULL,
  container         text,
  duration_seconds  numeric(10,3) NOT NULL,
  size_bytes        integer NOT NULL,
  sha256            text NOT NULL,
  uploaded_by       text NOT NULL,
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  is_active         boolean NOT NULL DEFAULT false
);
-- At most one active file per slot.
CREATE UNIQUE INDEX audio_versions_one_active_per_slot ON audio_versions (slot) WHERE is_active;

CREATE TABLE participants (
  id                 text PRIMARY KEY,
  created_at         timestamptz NOT NULL DEFAULT now(),
  status             text NOT NULL DEFAULT 'opened'
                     CHECK (status IN ('opened','declined','consented','ineligible','eligible','demographics_done','assigned','completed')),
  consent            boolean,
  consented_at       timestamptz,
  eligible           boolean,
  eligibility_at     timestamptz,
  age                smallint CHECK (age BETWEEN 18 AND 22),
  gender             text,
  major              text,
  demographics_at    timestamptz,
  instructions_at    timestamptz,
  condition          smallint CHECK (condition BETWEEN 1 AND 4),
  framing            text CHECK (framing IN ('positive','negative')),
  audio_type         text CHECK (audio_type IN ('crowd','brown')),
  assigned_at        timestamptz,
  allocation_seq     integer,
  allocation_method  text,
  audio_version_id   integer REFERENCES audio_versions(id),
  playback_volume    numeric(4,3),
  audio_status       text CHECK (audio_status IN ('started','started_after_tap')),
  audio_interrupted  boolean,
  trial_started_at   timestamptz,
  trial_resumed      boolean NOT NULL DEFAULT false,
  decision           text CHECK (decision IN ('yes_share','no_keep_private')),
  latency_ms         integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  latency_seconds    numeric(10,3),
  latency_source     text CHECK (latency_source IN ('client_monotonic','server_resumed')),
  server_elapsed_ms  integer,
  submitted_at       timestamptz,
  flags              text[] NOT NULL DEFAULT '{}',
  excluded           boolean NOT NULL DEFAULT false,
  -- Integrity: a completed record must be fully populated.
  CONSTRAINT completed_is_complete CHECK (
    status <> 'completed' OR (decision IS NOT NULL AND latency_ms IS NOT NULL AND condition IS NOT NULL
                              AND submitted_at IS NOT NULL AND audio_version_id IS NOT NULL)
  )
);
CREATE INDEX participants_condition_idx ON participants (condition);
CREATE INDEX participants_status_idx ON participants (status);

-- Immutable allocation log. participant_id is nulled (not the allocation) if a record is deleted.
CREATE TABLE allocations (
  seq            integer PRIMARY KEY,
  participant_id text UNIQUE REFERENCES participants(id) ON DELETE SET NULL,
  condition      smallint NOT NULL CHECK (condition BETWEEN 1 AND 4),
  block_index    integer,
  method         text NOT NULL,
  allocated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE allocation_blocks (
  block_index integer PRIMARY KEY,
  sequence    smallint[] NOT NULL CHECK (array_length(sequence,1) = 4),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audio_events (
  id             bigserial PRIMARY KEY,
  participant_id text NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  at             timestamptz NOT NULL DEFAULT now(),
  kind           text NOT NULL,
  detail         text
);
CREATE INDEX audio_events_participant_idx ON audio_events (participant_id);

-- OPERATIONAL: participant session secrets (hashed). Purgeable after data collection.
CREATE TABLE participant_sessions (
  participant_id text PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  token_hash     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- OPERATIONAL: admin authentication
CREATE TABLE admin_login_tokens (
  id         bigserial PRIMARY KEY,
  email      text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX admin_login_tokens_email_idx ON admin_login_tokens (email, created_at);

CREATE TABLE admin_sessions (
  id         bigserial PRIMARY KEY,
  email      text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE admin_audit (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  admin_email text NOT NULL,
  action      text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX admin_audit_at_idx ON admin_audit (at DESC);
