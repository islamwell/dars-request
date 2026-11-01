import { json, requireAdmin, ensureSchema, makeRefId, mapRequestRow } from '../_lib.js';
import { notifyAdminNewRequest } from '../_notify.js';

// GET /api/lecture-requests
// - Public lookup if ?ref=NQ-XXXXXX-XXXX is provided
// - Admin list of all requests (with optional ?status= filter) otherwise
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return json({ error: 'Database binding DB is not configured' }, 500);
  await ensureSchema(db);

  const url = new URL(context.request.url);
  const ref = (url.searchParams.get('ref') || '').trim();

  if (ref) {
    const row = await db
      .prepare('SELECT id, status, submitted_at, updated_at, decided_at, readiness, host_name, city, venue_type, occasion, preferred_date, start_time, duration, guests, assigned_teacher FROM lecture_requests WHERE id = ?')
      .bind(ref)
      .first();
    if (!row) return json({ error: 'Request not found' }, 404);
    return json({
      id: row.id,
      status: row.status,
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
      decidedAt: row.decided_at,
      readiness: row.readiness,
      hostName: row.host_name,
      city: row.city,
      venueType: row.venue_type,
      occasion: row.occasion,
      preferredDate: row.preferred_date,
      startTime: row.start_time,
      duration: row.duration,
      guests: row.guests,
      assignedTeacher: row.assigned_teacher || '',
    });
  }

  const guard = await requireAdmin(context);
  if (guard) return guard;

  const statusFilter = (url.searchParams.get('status') || '').trim().toLowerCase();
  let query = 'SELECT * FROM lecture_requests';
  const binds = [];
  if (statusFilter && ['pending', 'approved', 'declined'].includes(statusFilter)) {
    query += ' WHERE status = ?';
    binds.push(statusFilter);
  }
  query += ' ORDER BY submitted_at DESC';

  const stmt = binds.length ? db.prepare(query).bind(...binds) : db.prepare(query);
  const { results } = await stmt.all();
  const requests = (results || []).map(mapRequestRow);

  const countsRow = await db
    .prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) AS declined
    FROM lecture_requests`)
    .first();

  return json({
    ok: true,
    counts: {
      total: Number(countsRow?.total || 0),
      pending: Number(countsRow?.pending || 0),
      approved: Number(countsRow?.approved || 0),
      declined: Number(countsRow?.declined || 0),
    },
    requests,
  });
}

// POST /api/lecture-requests
// Public endpoint called by request.html upon submitting the 6-step form
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: 'Database binding DB is not configured' }, 500);
  await ensureSchema(db);

  const body = await context.request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid JSON payload' }, 400);
  }

  const data = (body.data && typeof body.data === 'object') ? body.data : {};
  const sections = Array.isArray(body.sections) ? body.sections : [];

  const hostName = String(data.hostName || body.hostName || '').trim();
  const phone = String(data.phone || body.phone || '').trim();
  const city = String(data.city || body.city || '').trim();

  if (!hostName || !phone || !city) {
    return json({ error: 'Host name, phone, and city are required.' }, 400);
  }

  const id = (body.id && /^NQ-[A-Z0-9-]+$/i.test(String(body.id).trim()))
    ? String(body.id).trim().toUpperCase()
    : makeRefId();

  const now = new Date().toISOString();
  const submittedAt = body.submittedAt && !Number.isNaN(Date.parse(body.submittedAt))
    ? new Date(body.submittedAt).toISOString()
    : now;

  const readiness = Math.max(0, Math.min(100, Math.round(Number(body.readiness ?? 0) || 0)));
  const email = String(data.email || '').trim().slice(0, 160) || null;
  const venueType = String(data.venueType || '').trim().slice(0, 60) || null;
  const occasion = String(data.occasion || '').trim().slice(0, 160) || null;
  const preferredDate = String(data.date || '').trim().slice(0, 30) || null;
  const altDate = String(data.altDate || '').trim().slice(0, 30) || null;
  const startTime = String(data.time || '').trim().slice(0, 20) || null;
  const duration = Math.max(15, Math.min(600, Math.round(Number(data.duration || 60) || 60)));
  const guests = Math.max(1, Math.min(10000, Math.round(Number(data.guests || 0) || 0)));
  const lang = String(data.lang || '').trim().slice(0, 40) || null;

  await db
    .prepare(`INSERT OR REPLACE INTO lecture_requests (
      id, status, submitted_at, updated_at, readiness,
      host_name, phone, email, city, venue_type, occasion,
      preferred_date, alt_date, start_time, duration, guests, lang,
      data_json, sections_json
    ) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id,
      submittedAt,
      now,
      readiness,
      hostName.slice(0, 140),
      phone.slice(0, 60),
      email,
      city.slice(0, 120),
      venueType,
      occasion,
      preferredDate,
      altDate,
      startTime,
      duration,
      guests,
      lang,
      JSON.stringify(data),
      JSON.stringify(sections)
    )
    .run();

  const origin = new URL(context.request.url).origin;
  const reqObj = {
    id,
    status: 'pending',
    submittedAt,
    readiness,
    hostName,
    phone,
    email,
    city,
    venueType,
    occasion,
    preferredDate,
    altDate,
    startTime,
    duration,
    guests,
    lang,
    data,
    sections,
  };
  if (typeof context.waitUntil === 'function') {
    context.waitUntil(notifyAdminNewRequest(context.env, reqObj, origin));
  } else {
    await notifyAdminNewRequest(context.env, reqObj, origin);
  }

  return json({
    ok: true,
    id,
    status: 'pending',
    submittedAt,
  }, 201);
}
