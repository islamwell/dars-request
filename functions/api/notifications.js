import { json, requireAdmin, ensureSchema } from '../_lib.js';
import { getNotificationSettings, saveNotificationSettings, dispatchNotifications } from '../_notify.js';

export async function onRequestGet(context) {
  const guard = requireAdmin(context);
  if (guard) return guard;

  const db = context.env.DB;
  if (!db) return json({ error: 'Database binding DB is not configured' }, 500);
  await ensureSchema(db);

  const settings = await getNotificationSettings(context.env);
  return json({ ok: true, settings });
}

export async function onRequestPost(context) {
  const guard = requireAdmin(context);
  if (guard) return guard;

  const db = context.env.DB;
  if (!db) return json({ error: 'Database binding DB is not configured' }, 500);
  await ensureSchema(db);

  const body = await context.request.json().catch(() => ({}));
  const action = body.action || 'save';

  const saved = body.settings
    ? await saveNotificationSettings(context.env, body.settings)
    : await getNotificationSettings(context.env);

  if (action === 'test') {
    const channel = body.channel || 'all';
    const origin = new URL(context.request.url).origin;
    const sampleReq = {
      id: 'NQ-TEST-ALERT',
      hostName: 'Ayesha Khan (Test Notification)',
      phone: '+47 900 00 000',
      city: 'Oslo',
      venueType: 'home',
      occasion: 'General dars / Quran reminder',
      preferredDate: new Date().toISOString().slice(0, 10),
      startTime: '18:00',
      duration: 60,
      guests: 40,
      lang: 'urdu',
      readiness: 95,
    };
    const results = await dispatchNotifications(saved, sampleReq, origin, channel);
    return json({ ok: true, settings: saved, results });
  }

  return json({ ok: true, settings: saved });
}

export async function onRequestPut(context) {
  return onRequestPost(context);
}
