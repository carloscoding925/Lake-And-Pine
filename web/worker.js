/**
 * Lake & Pine — review form endpoint.
 *
 * The site is static assets; this Worker exists only so /reviews has somewhere to POST.
 * Every other request falls straight through to the assets binding, so adding this
 * changed nothing about how the rest of the site is served.
 */

const LIMITS = { name: 120, email: 200, review: 5000, venue: 120, credit: 120 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/review') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
      }
      return handleReview(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleReview(request, env) {
  const type = request.headers.get('content-type') || '';
  // The page posts JSON when its script is running and form-encoded when it isn't.
  // A browser that submitted the form natively needs somewhere to land, not a JSON body.
  const isForm = type.includes('form-urlencoded') || type.includes('form-data');

  let data;
  try {
    data = isForm
      ? Object.fromEntries(await request.formData())
      : await request.json();
  } catch (_) {
    return reply(isForm, { error: 'Could not read that submission.' }, 400);
  }

  // Honeypot. Answer as though it worked — telling a bot it was caught only helps it.
  if (str(data.website)) {
    return reply(isForm, { ok: true }, 200);
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
    return reply(isForm, { error: `Missing or invalid: ${missing.join(', ')}` }, 400);
  }

  const key = env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY is not set');
    return reply(isForm, { error: 'Email is not configured.' }, 500);
  }

  const to = env.REVIEW_TO || 'weddings@lakeandpinecollective.com';
  const from = env.REVIEW_FROM || 'Lake & Pine Reviews <reviews@lakeandpinecollective.com>';

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
      subject: `New review — ${name} (${rating}/5)`,
      text: body({ name, email, review, rating, venue, credit, date, consent })
    })
  });

  if (!res.ok) {
    console.error('Resend rejected the send', res.status, await res.text());
    return reply(isForm, { error: 'Could not send that right now.' }, 502);
  }

  return reply(isForm, { ok: true }, 200);
}

/**
 * Plain text on purpose. The snippet at the bottom is the finished testimonial markup,
 * so adding a review to the site is a copy and paste rather than a retyping job.
 */
function body({ name, email, review, rating, venue, credit, date, consent }) {
  const display = credit || name;
  const detail = [formatDate(date), venue].filter(Boolean).join(' · ');
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

  return [
    `${stars}  (${rating}/5)`,
    '',
    review,
    '',
    '—'.repeat(48),
    `From:     ${name} <${email}>`,
    `Credit:   ${display}`,
    `Wedding:  ${detail || '(not given)'}`,
    `Publish:  ${consent ? 'YES — they ticked the consent box' : 'NO — do not put this on the site'}`,
    '—'.repeat(48),
    '',
    consent
      ? 'Paste into the testimonial grid in public/index.html:'
      : 'No consent given. The markup below is here only if they later say yes:',
    '',
    figure({ rating, review, display, detail })
  ].join('\n');
}

function figure({ rating, review, display, detail }) {
  const label = `${['One', 'Two', 'Three', 'Four', 'Five'][rating - 1]} out of five stars`;
  return [
    '      <figure class="testimonial reveal">',
    `        <div class="testimonial-stars" role="img" aria-label="${label}">${'★'.repeat(rating)}</div>`,
    `        <blockquote class="testimonial-quote">${escapeHtml(review)}</blockquote>`,
    '        <figcaption class="testimonial-attr">',
    `          <span class="testimonial-name">${escapeHtml(display)}</span>`,
    `          <span class="testimonial-detail">${escapeHtml(detail)}</span>`,
    '        </figcaption>',
    '      </figure>'
  ].join('\n');
}

// The month input gives "2026-04"; the card wants "April 2026".
function formatDate(value) {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value;
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const month = months[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : value;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function json(payload, status, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

// A native form submit gets a redirect it can actually render; fetch gets JSON.
function reply(isForm, payload, status) {
  if (!isForm) return json(payload, status);
  const target = payload.ok ? '/reviews/?sent=1' : '/reviews/?error=1';
  return new Response(null, { status: 303, headers: { Location: target } });
}
