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

async function sendEmail(
  env: Record<string, string | undefined>,
  fields: { name: string; email: string; service: string; message: string }
) {
  const apiKey = env.RESEND_API_KEY;
  // Delivered by Resend into the Zoho Mail inbox; Reply goes to the visitor.
  const to = env.CONTACT_TO_EMAIL || 'hello@app62.tech';
  const service = SERVICE_LABELS[fields.service] ?? '';

  // Fail loudly in logs rather than silently dropping submissions.
  if (!apiKey) {
    console.error('RESEND_API_KEY is not configured — contact submission was not emailed.');
    return false;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // Must be on a domain verified in Resend (app62.tech).
      from: env.CONTACT_FROM_EMAIL || 'App62 website <hello@app62.tech>',
      to: [to],
      reply_to: fields.email,
      subject: `New enquiry from ${fields.name}${service ? ` (${service})` : ''}`,
      text: `From: ${fields.name} <${fields.email}>\nService: ${service || 'not specified'}\n\n${fields.message}`,
    }),
  });

  if (!res.ok) console.error(`Resend rejected the contact email: ${res.status} ${await res.text()}`);
  return res.ok;
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

  // Cloudflare env bindings/secrets (@astrojs/cloudflare runtime).
  const runtimeEnv = (locals as { runtime?: { env?: Record<string, unknown> } })?.runtime?.env ?? {};
  const env = runtimeEnv as Record<string, string | undefined>;

  // Per-IP burst limit (binding configured in wrangler.jsonc). Checked after
  // cheap validation so malformed requests don't use up a visitor's quota.
  const limiter = runtimeEnv.CONTACT_LIMITER as
    { limit: (options: { key: string }) => Promise<{ success: boolean }> } | undefined;
  if (limiter) {
    const ip = request.headers.get('cf-connecting-ip') ?? clientAddress ?? 'unknown';
    const { success } = await limiter.limit({ key: ip });
    if (!success) return wantsJson ? jsonResponse({ ok: false, reason: 'rate_limited' }, 429) : redirectTo(url, false);
  }

  const turnstileSecret = env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const verified = turnstileToken
      ? await verifyTurnstile(turnstileToken, turnstileSecret, clientAddress ?? null)
      : false;
    if (!verified) {
      return wantsJson ? jsonResponse({ ok: false }, 400) : redirectTo(url, false);
    }
  } else {
    // Fail closed: without the secret every submission would go out
    // unverified, so a config slip must not silently disable spam protection.
    // (For local `wrangler dev`, put Turnstile's always-pass test secret in
    // .dev.vars — see README.)
    console.error('TURNSTILE_SECRET_KEY is not configured — rejecting submission.');
    return wantsJson ? jsonResponse({ ok: false, reason: 'not_configured' }, 503) : redirectTo(url, false);
  }

  const sent = await sendEmail(env, { name, email, service, message });

  return wantsJson ? jsonResponse({ ok: sent }, sent ? 200 : 502) : redirectTo(url, sent);
};
