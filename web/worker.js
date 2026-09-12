/**
 * Lake & Pine — review form endpoint.
 *
 * The site is static assets; this Worker exists only so /reviews has somewhere to POST.
 * Every other request falls straight through to the assets binding, so adding this
 * changed nothing about how the rest of the site is served.
 *
 * Four filters stand in front of the send, ordered cheapest first so a flood costs as
 * little as possible: same-origin, rate limit, honeypot, then Turnstile — which is the
 * only one that spends a network round trip.
 */

import { renderEmail } from './email.js';

const LIMITS = { name: 120, email: 200, review: 5000, venue: 120, credit: 120 };

const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Must match data-action on the widget in reviews/index.html. Pinned at verify time so
// a token minted by some other widget can't be spent here.
const TURNSTILE_ACTION = 'review';

// Cloudflare's documented dummy secrets, used by `wrangler dev` via web/.dev.vars.
const TESTING_SECRETS = new Set([
  '1x0000000000000000000000000000000AA', // always passes
  '2x0000000000000000000000000000000AA', // always fails
  '3x0000000000000000000000000000000AA'  // always reports "token already spent"
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/review') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
      }
      return handleReview(request, env, url);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleReview(request, env, url) {
  // 1. Same origin. The page submits with fetch(), so a real browser always sends
  // Origin and it always equals ours. Forgeable by anything that isn't a browser,
  // which is the point: it costs nothing and drops drive-by scripted posts.
  const origin = request.headers.get('Origin');
  if (!origin || !allowedOrigin(origin, url, env)) {
    return json({ error: 'Forbidden' }, 403);
  }

  // 2. Rate limit, keyed per IP. The binding's period is capped at 60s, so this is a
  // burst limiter rather than a daily cap — it stops a flood, which is the failure
  // mode that actually costs us. Guarded because `wrangler dev` without the binding
  // configured shouldn't crash the endpoint.
  if (env.REVIEW_LIMITER) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.REVIEW_LIMITER.limit({ key: ip });
    if (!success) {
      return json({ error: 'Too many submissions just now. Give it a minute and try again.' }, 429);
    }
  }

  let data;
  try {
    data = await request.json();
  } catch (_) {
    return json({ error: 'Could not read that submission.' }, 400);
  }

  // 3. Honeypot. Answer as though it worked — telling a bot it was caught only helps it.
  if (str(data.website)) {
    return json({ ok: true }, 200);
  }

  const name = str(data.name).slice(0, LIMITS.name);
  const email = str(data.email).slice(0, LIMITS.email);
  const review = str(data.review).slice(0, LIMITS.review);
  const rating = Number.parseInt(str(data.rating), 10);
  const venue = str(data.venue).slice(0, LIMITS.venue);
  const credit = str(data.credit).slice(0, LIMITS.credit);
  const date = str(data.date).slice(0, 20);
  const consent = str(data.consent) === 'yes';

  const missing = [];
  if (!name) missing.push('name');
  if (!email || !email.includes('@')) missing.push('email');
  if (!review) missing.push('review');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) missing.push('rating');
  if (missing.length) {
    return json({ error: `Missing or invalid: ${missing.join(', ')}` }, 400);
  }

  // 4. Turnstile. Last, because it is the only check that costs a round trip — no point
  // spending one on a submission the free checks above already rejected.
  const verdict = await verifyTurnstile(request, env, url, str(data['cf-turnstile-response']));
  if (!verdict.ok) {
    return json({ error: verdict.error }, verdict.status);
  }

  const key = env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY is not set');
    return json({ error: 'Email is not configured.' }, 500);
  }

  const to = env.REVIEW_TO || 'weddings@lakeandpinecollective.com';
  const from = env.REVIEW_FROM || 'Lake & Pine Reviews <reviews@lakeandpinecollective.com>';

  // Resend takes text and html together; clients pick whichever they render.
  const mail = renderEmail({ name, email, review, rating, venue, credit, date, consent });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      // So hitting reply in the inbox goes to the couple, not to the Worker's sender.
      reply_to: email,
      ...mail
    })
  });

  if (!res.ok) {
    console.error('Resend rejected the send', res.status, await res.text());
    return json({ error: 'Could not send that right now.' }, 502);
  }

  return json({ ok: true }, 200);
}

/**
 * Accepts a post from our own page. ALLOWED_ORIGINS (comma-separated) is an override
 * for the case where the page is served from a hostname the Worker doesn't see itself
 * as — a preview deployment, say. Without it this is simply same-origin, which needs
 * no configuration and can't be left misconfigured.
 */
function allowedOrigin(origin, url, env) {
  if (origin === url.origin) return true;
  return (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
    .includes(origin);
}

async function verifyTurnstile(request, env, url, token) {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Fails closed, like a missing Resend key. Spam protection that switches itself off
    // when its config goes missing is the one failure mode worth refusing outright.
    console.error('TURNSTILE_SECRET_KEY is not set');
    return { ok: false, status: 500, error: 'Spam protection is not configured.' };
  }

  if (!token || token.length > 2048) {
    return { ok: false, status: 403, error: HUMAN_CHECK_FAILED };
  }

  let result;
  try {
    const res = await fetch(TURNSTILE_VERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: request.headers.get('CF-Connecting-IP') || ''
      })
    });
    if (!res.ok) throw new Error(`siteverify returned ${res.status}`);
    result = await res.json();
  } catch (err) {
    // Reaching Cloudflare failed, which is not the submitter's fault — 502, not 403,
    // so the page can tell them to try again rather than accusing them of being a bot.
    console.error('Turnstile verification could not complete', err);
    return { ok: false, status: 502, error: 'Could not check that right now. Please try again.' };
  }

  // Tokens are single-use and expire after 300 seconds; the widget refreshes itself, and
  // the page resets it after a failed submit so a retry doesn't spend a spent token.
  //
  // Cloudflare's testing secrets answer with hostname "example.com" and no action field
  // at all, so pinning either one would reject every submission under `wrangler dev`.
  // Detected from the configured secret rather than from the response, so the decision
  // can't be influenced by what comes back over the network. This costs nothing in
  // production: a testing secret there already passes everything regardless.
  const testing = TESTING_SECRETS.has(secret);
  if (testing) {
    console.warn('Turnstile is using a testing secret — action and hostname are not pinned');
  }

  const expectedHostname = env.TURNSTILE_EXPECT_HOSTNAME || url.hostname;
  const ok = result.success && (testing || (
    result.action === TURNSTILE_ACTION &&
    result.hostname === expectedHostname
  ));

  if (!ok) {
    // error-codes is logged because the likely configuration mistakes — a wrong secret,
    // or the dummy testing sitekey left in the page against a live secret — look exactly
    // like a genuine bot from the outside otherwise.
    console.error('Turnstile rejected a submission', JSON.stringify({
      success: result.success,
      action: result.action,
      hostname: result.hostname,
      expectedHostname,
      codes: result['error-codes']
    }));
    return { ok: false, status: 403, error: HUMAN_CHECK_FAILED };
  }

  return { ok: true };
}

const HUMAN_CHECK_FAILED =
  'We could not confirm that submission. Please reload the page and try once more.';

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function json(payload, status, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}
