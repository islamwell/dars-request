import { json, requireAdmin, ensureSchema } from '../_lib.js';

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: 'Database binding DB is not configured' }, 500);
  await ensureSchema(db);

  const guard = await requireAdmin(context);
  if (guard) return guard;

  const body = await context.request.json().catch(() => ({}));
  const newPassword = String(body.newPassword || '').trim();

  if (!newPassword || newPassword.length < 6) {
    return json({ error: 'New password must be at least 6 characters long.' }, 400);
  }

  const now = new Date().toISOString();
  await db
    .prepare('INSERT OR REPLACE INTO admin_settings (key, value_json, updated_at) VALUES (?, ?, ?)')
    .bind('admin_password', JSON.stringify({ password: newPassword }), now)
    .run();

  return json({ ok: true, message: 'Admin password updated successfully.' });
}
