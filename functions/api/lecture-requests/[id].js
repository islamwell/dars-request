import { json, requireAdmin, ensureSchema, mapRequestRow } from '../../_lib.js';

export async function onRequestGet(context) {
  const guard = await requireAdmin(context);
  if (guard) return guard;

  const db = context.env.DB;
  if (!db) return json({ error: 'Database binding DB is not configured' }, 500);
  await ensureSchema(db);

  const id = context.params.id;
  const row = await db.prepare('SELECT * FROM lecture_requests WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'Lecture request not found' }, 404);
  return json({ ok: true, request: mapRequestRow(row) });
}

async function handleUpdate(context) {
  const guard = await requireAdmin(context);
  if (guard) return guard;

  const db = context.env.DB;
  if (!db) return json({ error: 'Database binding DB is not configured' }, 500);
  await ensureSchema(db);

  const id = context.params.id;
  const existing = await db.prepare('SELECT * FROM lecture_requests WHERE id = ?').bind(id).first();
  if (!existing) return json({ error: 'Lecture request not found' }, 404);

  const body = await context.request.json().catch(() => ({}));
  const validStatuses = ['pending', 'approved', 'declined'];
  const nextStatus = body.status && validStatuses.includes(String(body.status).toLowerCase())
    ? String(body.status).toLowerCase()
    : existing.status;

  const assignedTeacher = body.assignedTeacher !== undefined
    ? String(body.assignedTeacher || '').trim().slice(0, 140)
    : (existing.assigned_teacher || '');

  const adminNotes = body.adminNotes !== undefined
    ? String(body.adminNotes || '').trim().slice(0, 2000)
    : (existing.admin_notes || '');

  const now = new Date().toISOString();
  const decidedAt = (nextStatus === 'approved' || nextStatus === 'declined')
    ? (existing.status !== nextStatus ? now : (existing.decided_at || now))
    : null;

  await db
    .prepare(`UPDATE lecture_requests
      SET status = ?, updated_at = ?, decided_at = ?, assigned_teacher = ?, admin_notes = ?
      WHERE id = ?`)
    .bind(nextStatus, now, decidedAt, assignedTeacher || null, adminNotes || null, id)
    .run();

  const updated = await db.prepare('SELECT * FROM lecture_requests WHERE id = ?').bind(id).first();
  return json({ ok: true, request: mapRequestRow(updated) });
}

export async function onRequestPut(context) {
  return handleUpdate(context);
}

export async function onRequestPatch(context) {
  return handleUpdate(context);
}

export async function onRequestDelete(context) {
  const guard = await requireAdmin(context);
  if (guard) return guard;

  const db = context.env.DB;
  if (!db) return json({ error: 'Database binding DB is not configured' }, 500);
  await ensureSchema(db);

  const id = context.params.id;
  await db.prepare('DELETE FROM lecture_requests WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}
