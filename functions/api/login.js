import { json, getAdminPassword } from '../_lib.js';

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => ({}));
  const expected = getAdminPassword(context.env);
  if (!body.password || String(body.password) !== expected) {
    return json({ error: 'Incorrect password. Please try again.' }, 401);
  }
  return json({ ok: true });
}
