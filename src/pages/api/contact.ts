import type { APIRoute } from 'astro';

export const prerender = false;

const MAX_LENGTHS = { name: 200, email: 320, message: 5000, service: 40, company: 200 };

const SERVICE_LABELS: Record<string, string> = {
  'ai-transformation': 'AI transformation',
  web: 'Web',
  apps: 'Apps',
  'ai-agents': 'AI agents',
  automation: 'Automation',
};
const ALLOWED_SERVICES = new Set([...Object.keys(SERVICE_LABELS), '']);

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function redirectTo(url: URL, ok: boolean) {
  const dest = new URL('/', url);
  dest.searchParams.set(ok ? 'sent' : 'error', ok ? 'true' : '1');
  return new Response(null, { status: 303, headers: { Location: `${dest.pathname}${dest.search}#contact` } });
}

async function verifyTurnstile(token: string, secret: string, ip: string | null): Promise<boolean> {
  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  if (ip) body.set('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
  return !!data?.success;
}

type Env = Record<string, string | undefined>;
type Fields = { name: string; email: string; service: string; message: string };

const inbox = (env: Env) => env.CONTACT_TO_EMAIL || 'hello@app62.tech';
// Must be on a domain verified in Resend (app62.tech).
const sender = (env: Env) => env.CONTACT_FROM_EMAIL || 'App62 website <hello@app62.tech>';

async function resend(env: Env, email: Record<string, unknown>, what: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(email),
  });
  if (!res.ok) console.error(`Resend rejected the ${what}: ${res.status} ${await res.text()}`);
  return res.ok;
}

// The enquiry itself, delivered by Resend into the Zoho Mail inbox; Reply goes to the visitor.
async function sendEmail(env: Env, fields: Fields) {
  // Fail loudly in logs rather than silently dropping submissions.
  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not configured — contact submission was not emailed.');
    return false;
  }
  const service = SERVICE_LABELS[fields.service] ?? '';
  return resend(
    env,
    {
      from: sender(env),
      to: [inbox(env)],
      reply_to: fields.email,
      subject: `New enquiry from ${fields.name}${service ? ` (${service})` : ''}`,
      text: `From: ${fields.name} <${fields.email}>\nService: ${service || 'not specified'}\n\n${fields.message}`,
    },
    'contact email'
  );
}

// Confirmation to the visitor. Deliberately fixed text with nothing the visitor
// typed in it, so the form can't be used to send arbitrary content to a third
// party's address.
function sendAutoReply(env: Env, to: string) {
  return resend(
    env,
    {
      from: sender(env),
      to: [to],
      reply_to: inbox(env),
      subject: 'Thanks for getting in touch with App62',
      text: [
        'Hi,',
        '',
        "Thanks for your message — it has reached the App62 team, and we'll reply from this address.",
        '',
        'If you want to add anything in the meantime, just reply to this email.',
        '',
        '— App62',
        'https://app62.tech',
      ].join('\n'),
    },
    'auto-reply'
  );
}

// Instant notification to whichever channels are configured (both optional).
async function notify(env: Env, fields: Fields) {
  const service = SERVICE_LABELS[fields.service] || 'not specified';
  const excerpt = fields.message.length > 1000 ? `${fields.message.slice(0, 1000)}…` : fields.message;
  const text = `New enquiry from ${fields.name} <${fields.email}>\nService: ${service}\n\n${excerpt}`;
  const jobs: Promise<unknown>[] = [];

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    jobs.push(
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
      }).then(async (r) => r.ok || console.error(`Telegram alert failed: ${r.status} ${await r.text()}`))
    );
  }
  if (env.SLACK_WEBHOOK_URL) {
    jobs.push(
      fetch(env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).then(async (r) => r.ok || console.error(`Slack alert failed: ${r.status} ${await r.text()}`))
    );
  }
  await Promise.allSettled(jobs);
}

export const POST: APIRoute = async ({ request, locals, url, clientAddress }) => {
  const wantsJson = request.headers.get('Accept')?.includes('application/json');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return wantsJson ? jsonResponse({ ok: false }, 400) : redirectTo(url, false);
  }

  const get = (key: string) => String(form.get(key) ?? '').trim();

  const company = get('company'); // honeypot
  if (company) {
    // Bot tripped the honeypot — respond as if it worked, don't tip it off.
    return wantsJson ? jsonResponse({ ok: true }, 200) : redirectTo(url, true);
  }

  const name = get('name').slice(0, MAX_LENGTHS.name);
  const email = get('email').slice(0, MAX_LENGTHS.email);
  const service = get('service').slice(0, MAX_LENGTHS.service);
  const message = get('message').slice(0, MAX_LENGTHS.message);
  const turnstileToken = get('cf-turnstile-response');

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name || !email || !message || !emailPattern.test(email) || !ALLOWED_SERVICES.has(service)) {
    return wantsJson ? jsonResponse({ ok: false }, 400) : redirectTo(url, false);
  }

  // Cloudflare env bindings/secrets and execution context (@astrojs/cloudflare runtime).
  const runtime = (locals as { runtime?: { env?: Env; ctx?: { waitUntil: (p: Promise<unknown>) => void } } })?.runtime;
  const env = runtime?.env ?? {};

  const turnstileSecret = env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const verified = turnstileToken
      ? await verifyTurnstile(turnstileToken, turnstileSecret, clientAddress ?? null)
      : false;
    if (!verified) {
      return wantsJson ? jsonResponse({ ok: false }, 400) : redirectTo(url, false);
    }
  } else {
    console.error('TURNSTILE_SECRET_KEY is not configured — accepting submissions unverified.');
  }

  const fields = { name, email, service, message };
  const sent = await sendEmail(env, fields);

  if (sent) {
    // Extras run after the response is sent, so they never slow down or fail
    // the submission. The auto-reply only goes out when Turnstile has proven a
    // real visitor, so it can't be scripted against other people's inboxes.
    const extras = Promise.allSettled([
      notify(env, fields),
      turnstileSecret && env.CONTACT_AUTOREPLY !== 'off' ? sendAutoReply(env, email) : Promise.resolve(),
    ]);
    if (runtime?.ctx) runtime.ctx.waitUntil(extras);
    else await extras;
  }

  return wantsJson ? jsonResponse({ ok: sent }, sent ? 200 : 502) : redirectTo(url, sent);
};
