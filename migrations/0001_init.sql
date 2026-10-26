-- Skema awal AI Studio Konten.
-- Dompet, buku besar, generasi, resep, pengaturan, plafon harian, pesanan pembayaran.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  exempt_billing INTEGER NOT NULL DEFAULT 0,
  credit_balance_idr INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  generation_id TEXT,
  entry_type TEXT NOT NULL,
  amount_idr INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id, created_at);

CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT,
  prompt TEXT,
  input_json TEXT,
  result_r2_key TEXT,
  result_mime TEXT,
  result_filename TEXT,
  scene_r2_key TEXT,
  scene_mime TEXT,
  scene_filename TEXT,
  voice_r2_key TEXT,
  voice_mime TEXT,
  voice_filename TEXT,
  cost_ticks INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  list_price_idr INTEGER NOT NULL DEFAULT 0,
  charged_idr INTEGER NOT NULL DEFAULT 0,
  billing_note TEXT,
  error TEXT,
  provider_request_id TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_generations_user ON generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_created ON generations(created_at DESC);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  feature TEXT NOT NULL,
  mode TEXT NOT NULL,
  description TEXT NOT NULL,
  prompt_template TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spend_daily (
  day TEXT PRIMARY KEY,
  cost_usd REAL NOT NULL DEFAULT 0,
  cost_ticks INTEGER NOT NULL DEFAULT 0,
  alerted_50 INTEGER NOT NULL DEFAULT 0,
  alerted_100 INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount_idr INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at TEXT NOT NULL,
  paid_at TEXT
);
