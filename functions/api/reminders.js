import { json, requireAdmin, ensureSchema, mapRequestRow } from '../_lib.js';
import { formatReminderMessage, sendReminderNotification } from '../_notify.js';

function getDaysUntil(dateStr, todayStr) {
  if (!dateStr) return null;
  const d1 = new Date(dateStr + 'T00:00:00Z');
  const d0 = new Date(todayStr + 'T00:00:00Z');
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d0.getTime())) return null;
  return Math.round((d1.getTime() - d0.getTime()) / 86400000);
}

// GET /api/reminders
// Lists all upcoming approved lectures, days remaining, and reminder delivery status
export async function onRequestGet(context) {
  const guard = await requireAdmin(context);
  if (guard) return guard;

  const db = context.env.DB;
  if (!db) return json({ error: 'Database binding DB is not configured' }, 500);
  await ensureSchema(db);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Fetch approved requests
  const { results: rawRequests } = await db
    .prepare("SELECT * FROM lecture_requests WHERE status = 'approved' AND preferred_date IS NOT NULL ORDER BY preferred_date ASC")
    .all();

  // Fetch all reminder logs
  const { results: rawLogs } = await db
    .prepare("SELECT * FROM reminders_log ORDER BY sent_at DESC")
    .all();

  const logsByReq = new Map();
  (rawLogs || []).forEach((log) => {
    if (!logsByReq.has(log.request_id)) logsByReq.set(log.request_id, {});
    logsByReq.get(log.request_id)[log.reminder_type] = log;
  });

  const requests = (rawRequests || []).map((row) => {
    const req = mapRequestRow(row);
    const daysUntil = getDaysUntil(req.preferredDate, todayStr);
    const logs = logsByReq.get(req.id) || {};
    const sent2d = logs['2d'] || null;
    const sent1d = logs['1d'] || null;

    const due2d = daysUntil === 2 && !sent2d;
    const due1d = daysUntil === 1 && !sent1d;

    return {
      ...req,
      daysUntil,
      sent2d,
      sent1d,
      due2d,
      due1d,
      isDueToday: due2d || due1d,
    };
  });

  const dueCount = requests.filter((r) => r.isDueToday).length;

  return json({
    ok: true,
    today: todayStr,
    dueCount,
    requests,
    recentLogs: (rawLogs || []).slice(0, 25),
  });
}

// POST /api/reminders
// Triggers automatic delivery of due reminders, or manual single reminder dispatch
export async function onRequestPost(context) {
  const guard = await requireAdmin(context);
  if (guard) return guard;

  const db = context.env.DB;
  if (!db) return json({ error: 'Database binding DB is not configured' }, 500);
  await ensureSchema(db);

  const body = await context.request.json().catch(() => ({}));
  const origin = new URL(context.request.url).origin;
  const todayStr = new Date().toISOString().slice(0, 10);

  // Action 1: Single manual dispatch
  if (body.action === 'send_single') {
    const id = String(body.id || '').trim();
    const reminderType = body.reminderType === '1d' ? '1d' : '2d';
    if (!id) return json({ error: 'Request ID is required' }, 400);

    const row = await db.prepare('SELECT * FROM lecture_requests WHERE UPPER(id) = UPPER(?)').bind(id).first();
    if (!row) return json({ error: 'Request not found' }, 404);

    const req = mapRequestRow(row);
    const res = await sendReminderNotification(context.env, req, reminderType, origin);
    return json({ ok: true, id, reminderType, result: res });
  }

  // Action 2: Automatic run for all due reminders today
  const { results: rawRequests } = await db
    .prepare("SELECT * FROM lecture_requests WHERE status = 'approved' AND preferred_date IS NOT NULL")
    .all();

  const { results: rawLogs } = await db
    .prepare("SELECT request_id, reminder_type FROM reminders_log")
    .all();

  const sentMap = new Set((rawLogs || []).map((l) => `${l.request_id}:${l.reminder_type}`));

  const sentList = [];
  const errors = [];

  for (const row of rawRequests || []) {
    const req = mapRequestRow(row);
    const days = getDaysUntil(req.preferredDate, todayStr);

    if (days === 2 && !sentMap.has(`${req.id}:2d`)) {
      try {
        const res = await sendReminderNotification(context.env, req, '2d', origin);
        sentList.push({ id: req.id, hostName: req.hostName, reminderType: '2d', res });
      } catch (err) {
        errors.push({ id: req.id, reminderType: '2d', error: err.message });
      }
    }

    if (days === 1 && !sentMap.has(`${req.id}:1d`)) {
      try {
        const res = await sendReminderNotification(context.env, req, '1d', origin);
        sentList.push({ id: req.id, hostName: req.hostName, reminderType: '1d', res });
      } catch (err) {
        errors.push({ id: req.id, reminderType: '1d', error: err.message });
      }
    }
  }

  return json({
    ok: true,
    today: todayStr,
    dispatchedCount: sentList.length,
    sent: sentList,
    errors,
  });
}
