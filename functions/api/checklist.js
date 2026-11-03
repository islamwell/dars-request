import { json, ensureSchema } from '../_lib.js';

// POST /api/checklist
// Public endpoint for hosts to update their preparation checklist after entering their reference code
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: 'Database binding DB is not configured' }, 500);
  await ensureSchema(db);

  const body = await context.request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid JSON payload' }, 400);
  }

  const ref = String(body.ref || body.id || '').trim();
  if (!ref) {
    return json({ error: 'Confirmation code (reference ID) is required' }, 400);
  }

  const row = await db
    .prepare('SELECT id, data_json, readiness FROM lecture_requests WHERE UPPER(id) = UPPER(?)')
    .bind(ref)
    .first();

  if (!row) {
    return json({ error: `Request ${ref} not found. Please verify your reference code.` }, 404);
  }

  // Sanitize ready array
  const rawReady = Array.isArray(body.ready) ? body.ready : [];
  const ready = Array.from(new Set(rawReady.map((s) => String(s || '').trim()).filter(Boolean))).slice(0, 30);

  // Total checklist items is 17
  const TOTAL_ITEMS = 17;
  const readiness = Math.max(0, Math.min(100, Math.round((ready.length / TOTAL_ITEMS) * 100)));

  let data = {};
  try {
    data = JSON.parse(row.data_json || '{}');
  } catch (_) {}

  data.ready = ready;
  data.readiness = readiness;
  data.checklistLastUpdated = new Date().toISOString();

  const now = new Date().toISOString();

  await db
    .prepare('UPDATE lecture_requests SET readiness = ?, data_json = ?, updated_at = ? WHERE UPPER(id) = UPPER(?)')
    .bind(readiness, JSON.stringify(data), now, row.id)
    .run();

  return json({
    ok: true,
    id: row.id,
    readiness,
    ready,
    updatedAt: now,
  });
}
