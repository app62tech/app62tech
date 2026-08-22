import type { APIRoute } from 'astro';

export const prerender = false;

const MAX_LENGTHS = { name: 200, email: 320, message: 5000, service: 40, company: 200 };

const ALLOWED_SERVICES = new Set(['web', 'apps', 'ai-agents', 'automation', '']);

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function redirectTo(url: URL, ok: boolean) {
  const dest = new URL('/contact', url);
  dest.searchParams.set(ok ? 'sent' : 'error', ok ? 'true' : '1');
  return new Response(null, { status: 303, headers: { Location: dest.pathname + dest.search } });
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
  const to = env.CONTACT_TO_EMAIL || 'hello@app62.tech';

  // Resend account/API key not yet provisioned (PRD §9 blocker) — fail loudly
  // in logs instead of silently dropping submissions once it's added.
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
      from: env.CONTACT_FROM_EMAIL || 'App62 site <onboarding@resend.dev>',
      to: [to],
      reply_to: fields.email,
      subject: `New enquiry from ${fields.name}${fields.service ? ` (${fields.service})` : ''}`,
      text: `From: ${fields.name} <${fields.email}>\nService: ${fields.service || 'not specified'}\n\n${fields.message}`,
    }),
  });

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
  const env = (locals as { runtime?: { env?: Record<string, string | undefined> } })?.runtime?.env ?? {};

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

  const sent = await sendEmail(env, { name, email, service, message });

  return wantsJson ? jsonResponse({ ok: sent }, sent ? 200 : 502) : redirectTo(url, sent);
};
