const DEFAULT_SETTINGS = {
  email: {
    enabled: true,
    provider: 'resend', // 'resend' | 'brevo' | 'sendgrid' | 'postmark' | 'webhook'
    toEmail: 'it@nrq.no',
    fromEmail: 'NurulQuran Requests <onboarding@resend.dev>',
    resendApiKey: '',
    webhookUrl: '',
  },
  whatsapp: {
    enabled: false,
    provider: 'callmebot', // 'callmebot' | 'meta' | 'twilio'
    adminPhone: '',
    callmebotApiKey: '',
    metaPhoneNumberId: '',
    metaAccessToken: '',
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioFromWhatsApp: 'whatsapp:+14155238886',
  },
  sms: {
    enabled: false,
    provider: 'twilio', // 'twilio' | 'webhook'
    toPhone: '',
    fromPhone: '',
    twilioAccountSid: '',
    twilioAuthToken: '',
    webhookUrl: '',
    webhookToken: '',
  },
  telegram: {
    enabled: false,
    botToken: '',
    chatId: '',
  },
};

export async function getNotificationSettings(env) {
  let saved = {};
  if (env && env.DB) {
    try {
      const row = await env.DB
        .prepare('SELECT value_json FROM admin_settings WHERE key = ?')
        .bind('notifications')
        .first();
      if (row && row.value_json) {
        saved = JSON.parse(row.value_json);
      }
    } catch (_) {}
  }

  return {
    email: {
      ...DEFAULT_SETTINGS.email,
      ...(saved.email || {}),
      enabled: saved.email?.enabled !== undefined ? !!saved.email.enabled : true,
      toEmail: saved.email?.toEmail || env?.ADMIN_EMAIL || 'it@nrq.no',
      resendApiKey: saved.email?.resendApiKey || env?.RESEND_API_KEY || '',
    },
    whatsapp: {
      ...DEFAULT_SETTINGS.whatsapp,
      ...(saved.whatsapp || {}),
      adminPhone: saved.whatsapp?.adminPhone || env?.ADMIN_WHATSAPP_PHONE || '',
      callmebotApiKey: saved.whatsapp?.callmebotApiKey || env?.CALLMEBOT_API_KEY || '',
      metaPhoneNumberId: saved.whatsapp?.metaPhoneNumberId || env?.META_WA_PHONE_ID || '',
      metaAccessToken: saved.whatsapp?.metaAccessToken || env?.META_WA_TOKEN || '',
      twilioAccountSid: saved.whatsapp?.twilioAccountSid || env?.TWILIO_ACCOUNT_SID || '',
      twilioAuthToken: saved.whatsapp?.twilioAuthToken || env?.TWILIO_AUTH_TOKEN || '',
    },
    sms: {
      ...DEFAULT_SETTINGS.sms,
      ...(saved.sms || {}),
      toPhone: saved.sms?.toPhone || env?.ADMIN_SMS_PHONE || '',
      fromPhone: saved.sms?.fromPhone || env?.TWILIO_FROM_PHONE || '',
      twilioAccountSid: saved.sms?.twilioAccountSid || env?.TWILIO_ACCOUNT_SID || '',
      twilioAuthToken: saved.sms?.twilioAuthToken || env?.TWILIO_AUTH_TOKEN || '',
    },
    telegram: {
      ...DEFAULT_SETTINGS.telegram,
      ...(saved.telegram || {}),
      botToken: saved.telegram?.botToken || env?.TELEGRAM_BOT_TOKEN || '',
      chatId: saved.telegram?.chatId || env?.TELEGRAM_CHAT_ID || '',
    },
  };
}

export async function saveNotificationSettings(env, incoming) {
  const current = await getNotificationSettings(env);
  const merged = {
    email: { ...current.email, ...(incoming.email || {}) },
    whatsapp: { ...current.whatsapp, ...(incoming.whatsapp || {}) },
    sms: { ...current.sms, ...(incoming.sms || {}) },
    telegram: { ...current.telegram, ...(incoming.telegram || {}) },
  };
  const now = new Date().toISOString();
  await env.DB
    .prepare('INSERT OR REPLACE INTO admin_settings (key, value_json, updated_at) VALUES (?, ?, ?)')
    .bind('notifications', JSON.stringify(merged), now)
    .run();
  return merged;
}

const escHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function formatMessages(req, baseUrl = 'https://dars-request.pages.dev') {
  const adminUrl = `${baseUrl}/admin.html`;
  const cleanPhone = String(req.phone || '').replace(/[^\d]/g, '');
  const waHostUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : adminUrl;

  const plainText = [
    `🌸 New NurulQuran Lecture Request!`,
    `Ref: ${req.id}`,
    `Host: ${req.hostName} (${req.phone})`,
    `City: ${req.city} · Venue: ${req.venueType || '—'}`,
    `Occasion: ${req.occasion || 'General dars'}`,
    `Date: ${req.preferredDate || '—'} at ${req.startTime || '—'} (${req.duration || 60}m)`,
    `Guests: ~${req.guests || 0} · Language: ${req.lang || '—'} · Readiness: ${req.readiness || 0}%`,
    `Review & Approve/Decline: ${adminUrl}`,
  ].join('\n');

  const telegramHtml = [
    `🌸 <b>New NurulQuran Lecture Request</b>`,
    `<b>Ref:</b> <code>${escHtml(req.id)}</code>`,
    `<b>Host:</b> ${escHtml(req.hostName)} (<a href="${escHtml(waHostUrl)}">${escHtml(req.phone)}</a>)`,
    `<b>City:</b> ${escHtml(req.city)} · <b>Venue:</b> ${escHtml(req.venueType || '—')}`,
    `<b>Occasion:</b> ${escHtml(req.occasion || 'General dars')}`,
    `<b>Date & Time:</b> ${escHtml(req.preferredDate || '—')} at ${escHtml(req.startTime || '—')} (${escHtml(req.duration || 60)} min)`,
    `<b>Guests:</b> ~${escHtml(req.guests || 0)} · <b>Lang:</b> ${escHtml(req.lang || '—')} · <b>Readiness:</b> ${escHtml(req.readiness || 0)}%`,
    ``,
    `👉 <a href="${escHtml(adminUrl)}">Open Admin Panel to Approve / Decline</a>`,
  ].join('\n');

  const emailHtml = `
  <div style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff8f3;border:1px solid #f1dfe5;border-radius:20px;color:#2c2233">
    <h2 style="margin:0 0 8px;color:#e8577a">🌸 New Lecture Request (${escHtml(req.id)})</h2>
    <p style="margin:0 0 18px;color:#75687c;font-size:14px">A new NurulQuran lecture invitation has been submitted and is awaiting review.</p>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #f1dfe5">
      <tbody>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5;font-weight:700;width:36%">Reference</td><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5"><code>${escHtml(req.id)}</code></td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5;font-weight:700">Host Name</td><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5">${escHtml(req.hostName)}</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5;font-weight:700">Phone / WhatsApp</td><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5"><a href="${escHtml(waHostUrl)}" style="color:#3f9f6a;font-weight:700">${escHtml(req.phone)}</a></td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5;font-weight:700">City & Venue</td><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5">${escHtml(req.city)} (${escHtml(req.venueType || '—')})</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5;font-weight:700">Date & Time</td><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5">${escHtml(req.preferredDate || '—')} at ${escHtml(req.startTime || '—')} (${escHtml(req.duration || 60)} min)</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5;font-weight:700">Occasion</td><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5">${escHtml(req.occasion || 'General dars')}</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5;font-weight:700">Guests & Language</td><td style="padding:10px 14px;border-bottom:1px solid #f1dfe5">~${escHtml(req.guests || 0)} guests · ${escHtml(req.lang || '—')}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700">Checklist Readiness</td><td style="padding:10px 14px">${escHtml(req.readiness || 0)}%</td></tr>
      </tbody>
    </table>
    <div style="margin-top:20px;text-align:center">
      <a href="${escHtml(adminUrl)}" style="display:inline-block;padding:12px 24px;background:#e8577a;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700">Open Admin Panel to Approve / Decline →</a>
    </div>
  </div>`;

  return {
    subject: `🌸 New Lecture Request ${req.id} · ${req.hostName} (${req.city})`,
    plainText,
    telegramHtml,
    emailHtml,
  };
}

export async function sendEmailNotification(cfg, msg) {
  const toEmail = cfg.toEmail || 'it@nrq.no';
  if (!toEmail) return { ok: false, error: 'Recipient Admin Email is missing' };

  if (cfg.provider === 'webhook') {
    if (!cfg.webhookUrl) return { ok: false, error: 'Email Webhook URL is missing' };
    const r = await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: toEmail, subject: msg.subject, text: msg.plainText, html: msg.emailHtml }),
    });
    if (!r.ok) return { ok: false, error: `Webhook HTTP ${r.status}` };
    return { ok: true };
  }

  if (cfg.provider === 'brevo') {
    if (!cfg.resendApiKey) return { ok: false, error: 'Brevo API Key is missing. Add your Brevo API key in Admin Notifications settings.' };
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': cfg.resendApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: 'requests@nrq.no', name: 'NurulQuran Requests' },
        to: toEmail.split(',').map((s) => ({ email: s.trim() })).filter((x) => x.email),
        subject: msg.subject,
        htmlContent: msg.emailHtml,
        textContent: msg.plainText,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: d.message || `Brevo HTTP ${r.status}` };
    return { ok: true, id: d.messageId };
  }

  if (cfg.provider === 'sendgrid') {
    if (!cfg.resendApiKey) return { ok: false, error: 'SendGrid API Key is missing' };
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: toEmail.split(',').map((s) => ({ email: s.trim() })).filter((x) => x.email) }],
        from: { email: 'requests@nrq.no', name: 'NurulQuran Requests' },
        subject: msg.subject,
        content: [
          { type: 'text/plain', value: msg.plainText },
          { type: 'text/html', value: msg.emailHtml },
        ],
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return { ok: false, error: d.errors?.[0]?.message || `SendGrid HTTP ${r.status}` };
    }
    return { ok: true };
  }

  // Default: Resend API
  if (!cfg.resendApiKey) {
    return {
      ok: false,
      error: 'Resend API Key is missing. Please enter your Resend API Key (free from resend.com) in Admin Notifications settings, or select Webhook/Brevo/SendGrid.',
    };
  }

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: cfg.fromEmail || 'NurulQuran Requests <onboarding@resend.dev>',
      to: toEmail.split(',').map((s) => s.trim()).filter(Boolean),
      subject: msg.subject,
      html: msg.emailHtml,
      text: msg.plainText,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: d.message || d.error || `Resend HTTP ${r.status}` };
  return { ok: true, id: d.id };
}

export async function sendWhatsAppNotification(cfg, msg) {
  if (!cfg.adminPhone) return { ok: false, error: 'Admin WhatsApp phone number is missing' };
  const cleanPhone = String(cfg.adminPhone).replace(/[^\d+]/g, '');

  if (cfg.provider === 'callmebot') {
    if (!cfg.callmebotApiKey) return { ok: false, error: 'CallMeBot API key is missing' };
    const phoneDigits = cleanPhone.replace(/^\+/, '');
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phoneDigits)}&text=${encodeURIComponent(msg.plainText)}&apikey=${encodeURIComponent(cfg.callmebotApiKey)}`;
    const r = await fetch(url);
    if (!r.ok) return { ok: false, error: `CallMeBot HTTP ${r.status}` };
    return { ok: true };
  }

  if (cfg.provider === 'meta') {
    if (!cfg.metaPhoneNumberId || !cfg.metaAccessToken) {
      return { ok: false, error: 'Meta Phone Number ID or Access Token is missing' };
    }
    const r = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(cfg.metaPhoneNumberId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.metaAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone.replace(/^\+/, ''),
        type: 'text',
        text: { preview_url: true, body: msg.plainText },
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: d.error?.message || `Meta API HTTP ${r.status}` };
    return { ok: true };
  }

  if (cfg.provider === 'twilio') {
    if (!cfg.twilioAccountSid || !cfg.twilioAuthToken) {
      return { ok: false, error: 'Twilio Account SID or Auth Token is missing' };
    }
    const fromWa = cfg.twilioFromWhatsApp.startsWith('whatsapp:')
      ? cfg.twilioFromWhatsApp
      : `whatsapp:${cfg.twilioFromWhatsApp}`;
    const toWa = cleanPhone.startsWith('whatsapp:') ? cleanPhone : `whatsapp:${cleanPhone}`;
    const params = new URLSearchParams({ From: fromWa, To: toWa, Body: msg.plainText });
    const auth = btoa(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`);
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.twilioAccountSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: d.message || `Twilio WhatsApp HTTP ${r.status}` };
    return { ok: true, sid: d.sid };
  }

  return { ok: false, error: 'Unknown WhatsApp provider' };
}

export async function sendSmsNotification(cfg, msg) {
  if (!cfg.toPhone) return { ok: false, error: 'Admin SMS phone number is missing' };

  if (cfg.provider === 'webhook') {
    if (!cfg.webhookUrl) return { ok: false, error: 'SMS Webhook URL is missing' };
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.webhookToken) headers.Authorization = `Bearer ${cfg.webhookToken}`;
    const r = await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: cfg.toPhone, message: msg.plainText }),
    });
    if (!r.ok) return { ok: false, error: `SMS Webhook HTTP ${r.status}` };
    return { ok: true };
  }

  // Default: Twilio SMS
  if (!cfg.twilioAccountSid || !cfg.twilioAuthToken || !cfg.fromPhone) {
    return { ok: false, error: 'Twilio Account SID, Auth Token, or From Phone is missing' };
  }
  const params = new URLSearchParams({
    From: cfg.fromPhone,
    To: cfg.toPhone,
    Body: msg.plainText,
  });
  const auth = btoa(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.twilioAccountSid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: d.message || `Twilio SMS HTTP ${r.status}` };
  return { ok: true, sid: d.sid };
}

export async function sendTelegramNotification(cfg, msg) {
  if (!cfg.botToken || !cfg.chatId) {
    return { ok: false, error: 'Telegram Bot Token or Chat ID is missing' };
  }
  const r = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: cfg.chatId,
      text: msg.telegramHtml,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) {
    return { ok: false, error: d.description || `Telegram HTTP ${r.status}` };
  }
  return { ok: true };
}

export async function dispatchNotifications(settings, req, baseUrl, forceChannel = null) {
  const msg = formatMessages(req, baseUrl);
  const results = {};

  const shouldRun = (ch) => (forceChannel ? forceChannel === ch || forceChannel === 'all' : !!settings[ch]?.enabled);

  const tasks = [];
  if (shouldRun('email')) {
    tasks.push(
      sendEmailNotification(settings.email, msg)
        .then((r) => { results.email = r; })
        .catch((e) => { results.email = { ok: false, error: e.message }; })
    );
  }
  if (shouldRun('whatsapp')) {
    tasks.push(
      sendWhatsAppNotification(settings.whatsapp, msg)
        .then((r) => { results.whatsapp = r; })
        .catch((e) => { results.whatsapp = { ok: false, error: e.message }; })
    );
  }
  if (shouldRun('sms')) {
    tasks.push(
      sendSmsNotification(settings.sms, msg)
        .then((r) => { results.sms = r; })
        .catch((e) => { results.sms = { ok: false, error: e.message }; })
    );
  }
  if (shouldRun('telegram')) {
    tasks.push(
      sendTelegramNotification(settings.telegram, msg)
        .then((r) => { results.telegram = r; })
        .catch((e) => { results.telegram = { ok: false, error: e.message }; })
    );
  }

  await Promise.allSettled(tasks);
  return results;
}

export async function notifyAdminNewRequest(env, req, baseUrl) {
  try {
    const settings = await getNotificationSettings(env);
    return await dispatchNotifications(settings, req, baseUrl, null);
  } catch (e) {
    return { error: e.message };
  }
}

export function formatReminderMessage(req, reminderType = '2d', baseUrl = 'https://dars-request.pages.dev') {
  const is2d = reminderType === '2d';
  const statusUrl = `${baseUrl}/status.html?ref=${encodeURIComponent(req.id)}`;
  const cleanPhone = String(req.phone || '').replace(/[^\d]/g, '');

  const timeHeadline = is2d ? 'In 2 Days' : 'Tomorrow!';
  const subject = is2d
    ? `⏰ 2-Day Reminder: NurulQuran Lecture · ${req.occasion || 'Gathering'} (${req.hostName})`
    : `🌸 Tomorrow! Final Reminder: NurulQuran Lecture · ${req.occasion || 'Gathering'} (${req.hostName})`;

  const plainText = is2d
    ? [
        `Assalamu alaikum ${req.hostName} 🌸`,
        ``,
        `This is a friendly reminder that your NurulQuran lecture gathering is in 2 days!`,
        `• Ref: ${req.id}`,
        `• Date: ${req.preferredDate || '—'} at ${req.startTime || '—'} (${req.duration || 60} min)`,
        `• City & Venue: ${req.city} (${req.venueType || '—'})`,
        `• Assigned Ustaza: ${req.assignedTeacher || 'NurulQuran Team'}`,
        ``,
        `📋 Please check your preparation checklist (venue, sound, water, seating):`,
        statusUrl,
        ``,
        `May Allah bless your home and your gathering with barakah!`,
      ].join('\n')
    : [
        `Assalamu alaikum ${req.hostName} 🌸`,
        ``,
        `Tomorrow is the blessed day of your NurulQuran lecture gathering!`,
        `• Ref: ${req.id}`,
        `• Date: ${req.preferredDate || '—'} at ${req.startTime || '—'} (${req.duration || 60} min)`,
        `• Address: ${req.data?.address || req.city}`,
        `• Ustaza Seating: ${req.data?.teacherSeat || 'Chair + table'}`,
        `• Assigned Ustaza: ${req.assignedTeacher || 'NurulQuran Team'}`,
        ``,
        `✨ Final Checklist Reminder (Sound system, mic batteries, water & prayer space):`,
        statusUrl,
        ``,
        `We look forward to an inspiring session, in shā’ Allāh!`,
      ].join('\n');

  const emailHtml = `
  <div style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff8f3;border:1px solid #f1dfe5;border-radius:20px;color:#2c2233">
    <div style="text-align:center;margin-bottom:16px">
      <span style="font-size:36px">${is2d ? '⏰' : '🌸'}</span>
      <h2 style="margin:8px 0 4px;color:#e8577a">${is2d ? '2-Day Lecture Reminder' : 'Tomorrow! Final Lecture Reminder'}</h2>
      <p style="margin:0;color:#75687c;font-size:14px">NurulQuran Gathering Ref: <b>${escHtml(req.id)}</b></p>
    </div>

    <div style="background:#ffffff;padding:18px;border-radius:16px;border:1.5px solid #f1dfe5;margin-bottom:18px">
      <p style="margin:0 0 10px;font-size:15px;line-height:1.5">
        Assalamu alaikum <b>${escHtml(req.hostName)}</b> 🌸<br>
        ${is2d
          ? 'Your upcoming lecture gathering is just <b>2 days away</b>! In shā’ Allāh, we look forward to the gathering.'
          : 'Alhamdulillah, <b>tomorrow</b> is the day of your lecture gathering! We pray it will be a source of barakah and light.'}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px">
        <tbody>
          <tr><td style="padding:6px 0;font-weight:700;color:#75687c;width:40%">📅 Event Date</td><td style="padding:6px 0"><b>${escHtml(req.preferredDate || '—')}</b></td></tr>
          <tr><td style="padding:6px 0;font-weight:700;color:#75687c">⏰ Start Time</td><td style="padding:6px 0"><b>${escHtml(req.startTime || '—')}</b> (${escHtml(req.duration || 60)} min)</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;color:#75687c">📍 Location</td><td style="padding:6px 0">${escHtml(req.city)} ${req.data?.address ? '· ' + escHtml(req.data.address) : ''}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;color:#75687c">👩‍🏫 Assigned Ustaza</td><td style="padding:6px 0;color:#e8577a;font-weight:700">${escHtml(req.assignedTeacher || 'NurulQuran Team')}</td></tr>
          <tr><td style="padding:6px 0;font-weight:700;color:#75687c">🌸 Current Readiness</td><td style="padding:6px 0"><b>${escHtml(req.readiness || 0)}%</b> ready</td></tr>
        </tbody>
      </table>
    </div>

    <div style="background:#fff0f4;padding:16px;border-radius:16px;border:1.5px solid #fecdd3;margin-bottom:20px;text-align:center">
      <h3 style="margin:0 0 6px;font-size:15px;color:#c02648">📋 Review & Update Your Checklist</h3>
      <p style="margin:0 0 12px;font-size:13px;color:#75687c">Please verify your sound system, seating, water arrangement, and parking.</p>
      <a href="${escHtml(statusUrl)}" style="display:inline-block;padding:10px 22px;background:#e8577a;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;font-size:14px">Update Preparation Checklist →</a>
    </div>

    <p style="margin:0;font-size:12px;color:#75687c;text-align:center">
      NurulQuran Lecture Requests · If you have questions, call <a href="tel:+4799106785" style="color:#e8577a;font-weight:700">+47 991 06 785</a>
    </p>
  </div>`;

  return {
    subject,
    plainText,
    emailHtml,
    statusUrl,
    timeHeadline,
  };
}

export async function sendReminderNotification(env, req, reminderType, baseUrl = 'https://dars-request.pages.dev') {
  const msg = formatReminderMessage(req, reminderType, baseUrl);
  const settings = await getNotificationSettings(env);

  const recipientEmails = [req.email, settings.email?.toEmail || 'it@nrq.no']
    .filter(Boolean)
    .join(', ');

  const emailCfg = {
    ...settings.email,
    toEmail: recipientEmails,
  };

  const results = { email: null, sentAt: new Date().toISOString() };

  if (settings.email?.enabled) {
    results.email = await sendEmailNotification(emailCfg, msg);
  }

  // Record in reminders_log
  if (env && env.DB) {
    try {
      await env.DB
        .prepare(`INSERT OR REPLACE INTO reminders_log (
          request_id, reminder_type, sent_at, recipient, channel, status
        ) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(
          req.id,
          reminderType,
          results.sentAt,
          recipientEmails,
          'email',
          results.email?.ok ? 'sent' : (results.email?.error || 'attempted')
        )
        .run();
    } catch (_) {}
  }

  return { ok: true, reminderType, results, msg };
}
