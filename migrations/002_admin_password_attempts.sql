-- OPERATIONAL: failed shared-password sign-in attempts, used only for rate limiting (5 per email / 20 per IP per 15 min).
-- Rows older than the window carry no meaning and can be deleted at any time.
CREATE TABLE admin_password_attempts (
  id         bigserial PRIMARY KEY,
  email      text NOT NULL,
  ip         text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_password_attempts_email_idx ON admin_password_attempts (email, created_at);
CREATE INDEX admin_password_attempts_ip_idx ON admin_password_attempts (ip, created_at);
