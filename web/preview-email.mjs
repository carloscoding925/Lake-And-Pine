/**
 * Render the review notification email to local files so it can be eyeballed
 * without sending anything.
 *
 *   node preview-email.mjs           # writes to ./.email-preview/
 *   node preview-email.mjs --open    # …and opens the HTML (macOS)
 *
 * It imports the same renderEmail() the Worker uses, so what you see here is what
 * actually goes out. Output is gitignored.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';

import { renderEmail } from './email.js';

const CASES = {
  'five-star': {
    name: 'Catherine Reyes',
    email: 'catherine@example.com',
    review: 'Fantastic energy from start to finish! They made our day so much easier, were seamless to work with, and worth every penny. We’d absolutely book again!',
    rating: 5,
    venue: 'North Tahoe',
    credit: 'Catherine R.',
    date: '2026-04',
    consent: true
  },
  // The awkward one: no consent, no venue, and characters that must not break the
  // pasteable snippet or render as markup inside the <pre>.
  'three-star-no-consent': {
    name: 'Sam & Jo',
    email: 'sam@example.com',
    review: 'Good <em>but</em> the drive & parking were rough. Ceremony photos were lovely though.',
    rating: 3,
    venue: '',
    credit: '',
    date: '',
    consent: false
  },
  'long-review': {
    name: 'Priya Raghunathan-Whitfield',
    email: 'priya@example.com',
    review: 'We were nervous about having three photographers because we thought it would feel crowded, and it genuinely did not. They moved like people who have worked together for years, which of course they have. Our families are spread across three countries and the film meant the ones who could not travel still felt like they were there. Worth every conversation we had about the budget.',
    rating: 5,
    venue: 'Gardnerville',
    credit: 'Priya R.',
    date: '2026-11',
    consent: true
  }
};

const dir = new URL('./.email-preview/', import.meta.url);
await mkdir(dir, { recursive: true });

const index = [];
for (const [slug, fields] of Object.entries(CASES)) {
  const { subject, html, text } = renderEmail(fields);
  await writeFile(new URL(`./${slug}.html`, dir), html);
  await writeFile(new URL(`./${slug}.txt`, dir), `Subject: ${subject}\n\n${text}\n`);
  index.push({ slug, subject });
  console.log(`${slug.padEnd(24)} ${subject}`);
}

const list = index
  .map(i => `<li><a href="${i.slug}.html">${i.slug}</a> &mdash; <code>${i.subject}</code> &nbsp;<a href="${i.slug}.txt">text</a></li>`)
  .join('\n');
await writeFile(new URL('./index.html', dir), `<!DOCTYPE html>
<meta charset="utf-8"><title>Email preview</title>
<style>body{font:15px/1.6 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px}
code{background:#eee;padding:2px 5px}li{margin:10px 0}</style>
<h1>Review email preview</h1>
<p>Rendered by <code>preview-email.mjs</code> from the same template the Worker sends.</p>
<ul>\n${list}\n</ul>`);

console.log(`\nWrote ${index.length} previews to web/.email-preview/`);

if (process.argv.includes('--open')) {
  execFile('open', [new URL('./index.html', dir).pathname]);
}
