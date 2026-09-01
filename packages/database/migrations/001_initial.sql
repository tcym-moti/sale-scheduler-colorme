CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  shop_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'UNINSTALLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_installations (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  app_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INSTALLED' CHECK (status IN ('INSTALLED', 'UNINSTALLED')),
  charge_source_id TEXT,
  recurring_charge_id TEXT,
  charge_id TEXT,
  owner_email TEXT,
  trial_starts_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uninstalled_at TIMESTAMPTZ,
  UNIQUE (shop_id, app_key)
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  shop_id UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  scope TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_sessions (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS app_sessions_active_idx
  ON app_sessions (token_hash, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  state_hash TEXT NOT NULL UNIQUE,
  return_to TEXT NOT NULL DEFAULT '/',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS oauth_states_expiry_idx ON oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS sale_schedules (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'SCHEDULED', 'STARTING', 'ACTIVE', 'ENDING', 'COMPLETED', 'PARTIAL', 'CONFLICT', 'FAILED', 'CANCELLED')),
  pricing_mode TEXT NOT NULL CHECK (pricing_mode IN ('FIXED', 'DISCOUNT_RATE')),
  pricing_value INTEGER NOT NULL CHECK (pricing_value >= 0),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL CHECK (end_at > start_at),
  time_zone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sale_schedules_shop_created_idx ON sale_schedules (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sale_schedules_due_idx ON sale_schedules (status, start_at, end_at);

CREATE TABLE IF NOT EXISTS sale_schedule_items (
  id UUID PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES sale_schedules(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  product_name TEXT NOT NULL,
  original_price INTEGER,
  effective_original_price INTEGER,
  scheduled_price INTEGER NOT NULL CHECK (scheduled_price >= 100),
  current_price INTEGER,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'STARTING', 'ACTIVE', 'ENDING', 'COMPLETED', 'PARTIAL', 'CONFLICT', 'FAILED', 'CANCELLED', 'RETRY_WAIT')),
  conflict_reason TEXT,
  last_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_id, product_id)
);

CREATE INDEX IF NOT EXISTS sale_schedule_items_shop_product_idx ON sale_schedule_items (shop_id, product_id);
CREATE INDEX IF NOT EXISTS sale_schedule_items_schedule_idx ON sale_schedule_items (schedule_id, created_at);

CREATE TABLE IF NOT EXISTS sale_jobs (
  id UUID PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES sale_schedules(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES sale_schedule_items(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('START', 'END')),
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  run_at TIMESTAMPTZ NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  mutation_state TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (mutation_state IN ('NOT_STARTED', 'IN_FLIGHT', 'UNKNOWN', 'CONFIRMED')),
  lease_until TIMESTAMPTZ,
  worker_id TEXT,
  last_error TEXT,
  last_response_status INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, operation)
);

CREATE INDEX IF NOT EXISTS sale_jobs_queue_idx ON sale_jobs (status, run_at, created_at);
CREATE INDEX IF NOT EXISTS sale_jobs_schedule_idx ON sale_jobs (schedule_id, operation);

CREATE TABLE IF NOT EXISTS api_rate_events (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_rate_events_shop_time_idx ON api_rate_events (shop_id, requested_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  request_id TEXT,
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  schedule_id UUID REFERENCES sale_schedules(id) ON DELETE SET NULL,
  item_id UUID REFERENCES sale_schedule_items(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  endpoint TEXT,
  from_price INTEGER,
  to_price INTEGER,
  response_status INTEGER,
  retry_count INTEGER,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_schedule_idx ON audit_logs (schedule_id, created_at DESC);
