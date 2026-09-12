/**
 * Review notification email — shared by worker.js and preview-email.mjs.
 *
 * Lives in its own module so the preview renders the exact template that gets sent;
 * a preview that can drift from the real thing is worse than no preview.
 *
 * Written for the photographers, not for whoever maintains the site: it reports a
 * review in readable form and stops there. It deliberately carries no markup to copy.
 *
 * Email is not the web. Three constraints shape everything below:
 *   1. Google Fonts do not load. Gmail strips the <link>, Outlook ignores it. Playfair
 *      and Cormorant are unavailable, so the serif stack falls back to Georgia, which
 *      is on essentially every client and carries a similar high-contrast feel.
 *   2. Styles are inline. Several clients drop <style> blocks entirely.
 *   3. Layout is tables. Desktop Outlook renders with Word's engine, which has no
 *      meaningful flexbox or grid support.
 */

const C = {
  cream: '#F5EFE2',
  creamWarm: '#EFE6D2',
  paper: '#FCFAF4',
  forestDeep: '#1F2A1F',
  forestSoft: '#4A5D48',
  gold: '#B08A3E',
  rule: 'rgba(45,59,45,0.18)'
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export function renderEmail(f) {
  const display = f.credit || f.name;
  const detail = [formatDate(f.date), f.venue].filter(Boolean).join(' · ');

  return {
    subject: `New review — ${f.name} (${f.rating}/5)`,
    text: text(f, { display, detail }),
    html: html(f, { display, detail })
  };
}

/* ---------------------------------------------------------------- plain text */
/* Kept alongside the HTML, not replaced by it: Resend sends both and the client picks. */
function text(f, { display, detail }) {
  const stars = '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating);
  return [
    `${stars}  (${f.rating}/5)`,
    '',
    f.review,
    '',
    '—'.repeat(48),
    `From:     ${f.name} <${f.email}>`,
    `Credit:   ${display}`,
    `Wedding:  ${detail || '(not given)'}`,
    `Publish:  ${f.consent ? 'YES — they ticked the consent box' : 'NO — do not put this on the site'}`,
    '—'.repeat(48)
  ].join('\n');
}

/* ---------------------------------------------------------------------- html */
function html(f, { display, detail }) {
  const stars =
    `<span style="color:${C.gold};">${'★'.repeat(f.rating)}</span>` +
    `<span style="color:${C.rule};">${'☆'.repeat(5 - f.rating)}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(`New review — ${f.name}`)}</title>
</head>
<body style="margin:0;padding:0;background:${C.cream};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream};">
<tr><td align="center" style="padding:28px 12px;">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;background:${C.paper};border:1px solid ${C.rule};">

    <tr><td style="background:${C.forestDeep};padding:26px 32px;">
      <div style="font-family:${SANS};font-size:10px;letter-spacing:0.32em;text-transform:uppercase;color:${C.gold};">New Review</div>
      <div style="font-family:${SERIF};font-size:17px;letter-spacing:0.18em;color:${C.cream};padding-top:7px;">LAKE &amp; PINE</div>
    </td></tr>

    <tr><td style="background:${C.creamWarm};padding:30px 32px;border-bottom:1px solid ${C.rule};">
      <div style="font-size:20px;line-height:1;letter-spacing:3px;">${stars}</div>
      <div style="font-family:${SERIF};font-style:italic;font-size:18px;line-height:1.6;color:${C.forestDeep};padding-top:18px;">
        &ldquo;${escapeHtml(f.review)}&rdquo;
      </div>
    </td></tr>

    <tr><td style="padding:26px 32px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${row('From', `${escapeHtml(f.name)} &lt;${escapeHtml(f.email)}&gt;`)}
        ${row('Credit', escapeHtml(display))}
        ${row('Wedding', escapeHtml(detail) || '<span style="opacity:0.5;">not given</span>')}
        ${row('Publish', consentBadge(f.consent), true)}
      </table>
    </td></tr>


    <tr><td style="background:${C.creamWarm};padding:16px 32px;border-top:1px solid ${C.rule};">
      <div style="font-family:${SANS};font-size:11px;line-height:1.5;color:${C.forestSoft};">
        Sent by the review form at lakeandpinecollective.com/reviews · reply to reach ${escapeHtml(f.name)}
      </div>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

function row(label, value, last) {
  return `<tr>
    <td style="font-family:${SANS};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${C.forestSoft};padding:9px 14px 9px 0;white-space:nowrap;vertical-align:top;border-bottom:${last ? 'none' : `1px solid ${C.rule}`};">${label}</td>
    <td style="font-family:${SANS};font-size:14px;color:${C.forestDeep};padding:9px 0;vertical-align:top;border-bottom:${last ? 'none' : `1px solid ${C.rule}`};">${value}</td>
  </tr>`;
}

function consentBadge(consent) {
  return consent
    ? `<span style="display:inline-block;background:${C.gold};color:${C.forestDeep};font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;padding:5px 11px;">Yes &mdash; OK to publish</span>`
    : `<span style="display:inline-block;border:1px solid ${C.rule};color:${C.forestSoft};font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;padding:5px 11px;">No &mdash; do not publish</span>`;
}

/* --------------------------------------------------------------------- utils */
// The month input gives "2026-04"; the card wants "April 2026".
export function formatDate(value) {
  const m = /^(\d{4})-(\d{2})$/.exec(value || '');
  if (!m) return value || '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const month = months[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : value;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
