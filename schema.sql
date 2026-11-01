CREATE TABLE IF NOT EXISTS lecture_requests (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  readiness INTEGER NOT NULL DEFAULT 0,
  host_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  city TEXT NOT NULL,
  venue_type TEXT,
  occasion TEXT,
  preferred_date TEXT,
  alt_date TEXT,
  start_time TEXT,
  duration INTEGER,
  guests INTEGER,
  lang TEXT,
  assigned_teacher TEXT,
  admin_notes TEXT,
  decided_at TEXT,
  data_json TEXT NOT NULL,
  sections_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON lecture_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_submitted_at ON lecture_requests(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_date ON lecture_requests(preferred_date);

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
