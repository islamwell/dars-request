export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function getAdminPassword(env) {
  if (env && env.DB) {
    try {
      const row = await env.DB
        .prepare('SELECT value_json FROM admin_settings WHERE key = ?')
        .bind('admin_password')
        .first();
      if (row && row.value_json) {
        const parsed = JSON.parse(row.value_json);
        if (parsed && parsed.password) return String(parsed.password);
      }
    } catch (_) {}
  }
  return (env && env.ADMIN_PASSWORD) ? String(env.ADMIN_PASSWORD) : 'nurulquran2026';
}

export async function requireAdmin(context) {
  const expected = await getAdminPassword(context.env);
  const authHeader = context.request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const sent = (
    context.request.headers.get('x-admin-password') ||
    context.request.headers.get('x-admin-key') ||
    bearerToken ||
    ''
  ).trim();
  if (!sent || sent !== expected) {
    return json({ error: 'Invalid admin password' }, 401);
  }
  return null;
}

let schemaReady = false;
export async function ensureSchema(db) {
  if (schemaReady || !db) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS lecture_requests (
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
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_requests_status ON lecture_requests(status)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_requests_submitted_at ON lecture_requests(submitted_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_requests_date ON lecture_requests(preferred_date)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
  ]);
  schemaReady = true;
}

export function makeRefId() {
  const d = new Date();
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `NQ-${yy}${mm}${dd}-${rand}`;
}

export function mapRequestRow(r) {
  if (!r) return null;
  let data = {};
  let sections = [];
  try {
    data = JSON.parse(r.data_json || '{}');
  } catch (_) {}
  try {
    sections = JSON.parse(r.sections_json || '[]');
  } catch (_) {}
  return {
    id: r.id,
    status: r.status || 'pending',
    submittedAt: r.submitted_at,
    updatedAt: r.updated_at,
    decidedAt: r.decided_at || null,
    readiness: Number(r.readiness || 0),
    hostName: r.host_name || data.hostName || '',
    phone: r.phone || data.phone || '',
    email: r.email || data.email || '',
    city: r.city || data.city || '',
    venueType: r.venue_type || data.venueType || '',
    occasion: r.occasion || data.occasion || '',
    preferredDate: r.preferred_date || data.date || '',
    altDate: r.alt_date || data.altDate || '',
    startTime: r.start_time || data.time || '',
    duration: Number(r.duration || data.duration || 60),
    guests: Number(r.guests || data.guests || 0),
    lang: r.lang || data.lang || '',
    assignedTeacher: r.assigned_teacher || '',
    adminNotes: r.admin_notes || '',
    data,
    sections,
  };
}
