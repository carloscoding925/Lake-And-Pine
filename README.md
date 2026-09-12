# Lake & Pine Collective

Static marketing site for **Lake & Pine Collective**, a wedding photo and film collective based in the Reno-Tahoe area. The site is a single-page portfolio with sections for the team's story, approach, photo and film work, packages, testimonials, and contact details. Enquiries go through a `mailto:` link rather than a form. The one piece of server-side code is a small Worker backing the review form at `/reviews` (see [Review form](#review-form)).

Live at [lakeandpinecollective.com](https://lakeandpinecollective.com).

## Tech stack

The site is intentionally simple — no build step, no framework — so it stays fast and easy to maintain.

- **HTML / CSS / vanilla JS** — single `index.html`, single `styles.css`, and one inline `<script>` covering the sticky-nav scroll state, the mobile hamburger toggle, reveal-on-scroll animations via `IntersectionObserver`, the film carousel, and the film lightbox.
- **Google Fonts** — Playfair Display, Cormorant Garamond, and Inter, loaded via `<link rel="preconnect">` for fast first paint.
- **Vimeo** — highlight films are embedded via Vimeo's iframe player rather than self-hosted, so we get adaptive-bitrate streaming, a polished player, and no Cloudflare bandwidth cost for video (see [Films](#films)).
- **Cloudflare Workers** — deployment target, using Workers static assets. Configured via [`wrangler.jsonc`](web/wrangler.jsonc) with `assets.directory: "./public"`, so `web/public/` is the site root and `web/worker.js` sits outside it and is never itself servable.
- **Resend** — transactional email API the review Worker posts to. The API key lives in Worker secrets, never in the repo.
- **ImageMagick** — local CLI tool used to resize and recompress portfolio photos before deploy (see [Image workflow](#image-workflow)).

## Project structure

```
Lake-And-Pine/
├── assets/                    # Original full-resolution photos (NOT deployed — kept for re-processing)
├── web/                          # Wrangler's root — nothing here is served except public/
│   ├── wrangler.jsonc            # Cloudflare deploy config
│   ├── worker.js                 # /api/review endpoint; falls through to assets
│   ├── email.js                  # Notification email template (worker + preview share it)
│   ├── preview-email.mjs         # Renders that email locally without sending
│   └── public/                   # Everything in here is what gets served
│       ├── index.html
│       ├── styles.css
│       ├── reviews/
│       │   └── index.html        # /reviews — submission form (noindex, unlinked)
│       ├── favicon.ico           # Browser tab icon (multi-size 16/32/48)
│       ├── apple-touch-icon.png  # iOS / iMessage icon (180×180)
│       ├── og-image.png          # Open Graph link preview (1200×1200)
│       ├── robots.txt            # Allows all crawlers, points at the sitemap
│       ├── sitemap.xml           # Single-URL sitemap (update lastmod on content changes)
│       └── optimized-assets/     # Web-ready portfolio images and team portraits
└── README.md
```

The split between `assets/` (project root) and `web/public/optimized-assets/` is deliberate: only files inside `web/public/` are served by Cloudflare, so the high-resolution originals never ship to the public site but stay available locally for re-processing.

`worker.js`, `email.js`, and `preview-email.mjs` sit beside `public/` rather than inside it for the same reason — anything in the assets directory becomes a public URL. Verified: `/worker.js` and `/email.js` both 404.

## Local development

Serve the `web/public/` folder with any static server:

```bash
cd web/public
python3 -m http.server 8000
# then visit http://localhost:8000
```

This serves the pages but not the Worker, so submitting the review form will fail — that path
needs `wrangler dev` below.

For a closer-to-production preview that mirrors the Cloudflare environment — and the only way
to exercise the review endpoint — run wrangler from inside `web/` so it picks up `wrangler.jsonc`:

```bash
cd web
npx wrangler dev
```

`open web/public/index.html` or `open web/public/reviews/index.html` also works for quick layout and copy tweaks, but serve over HTTP when testing the film players or the lightbox — they talk to Vimeo across origins, which behaves differently from `file://`.

## Deployment

Pushes to the `main` branch trigger an automatic build and deploy of the `web/` directory to Cloudflare.

The review Worker needs `RESEND_API_KEY`, and **production and local dev read it from two
different places** — a repo-root `.env` supplies neither.

For the deployed Worker, set it once. The command prompts for the value, so the key never reaches
your shell history:

```bash
cd web
npx wrangler secret put RESEND_API_KEY
```

For `wrangler dev`, put it in `web/.dev.vars` (gitignored, alongside `wrangler.jsonc` — not the
repo root):

```
RESEND_API_KEY=re_...
```

Without it the endpoint returns `500 {"error":"Email is not configured."}`; with a bad key it
returns `502`. Those two responses are the quickest way to tell which half is misconfigured.

`REVIEW_TO` and `REVIEW_FROM` are optional overrides; without them the Worker sends to
`weddings@lakeandpinecollective.com` from `reviews@lakeandpinecollective.com`.

**Set the production secret after a deploy, not before.** Cloudflare refuses `wrangler secret put`
when the Worker's latest version isn't the active deployment:

```
✘ [ERROR] Secret edit failed. You attempted to modify a secret, but the latest version of your
  Worker isn't currently deployed.
```

So the order is: merge to `main`, let the build deploy, *then* set the secret. Two ways around it if
you need the key in place first — the Cloudflare dashboard (**Workers & Pages → lakeandpine →
Settings → Variables and Secrets**) isn't subject to the check, and `wrangler versions secret put`
works but creates a version that still needs deploying, so it adds a step rather than removing one.

## Films

The three highlight films live in a centre-focus carousel: the active film sits dead centre with its neighbours peeking either side, and the ends wrap around. Arrows, dots, arrow keys, and horizontal swipe all move it. Only the focused film is playable — clicks on a neighbour pull it into focus instead.

Two things about the layout are load-bearing and shouldn't be changed casually:

- **`.film-slide` is `54%` wide** (~648px on desktop). Vimeo's control bar is responsive: below roughly 620px it collapses fullscreen, quality, and PiP behind an overflow chevron, so the player has to stay above that width for the fullscreen button to appear inline. Measured behaviour — 576px collapses, 600px shows volume only, 624px shows the full bar.
- **Embeds carry `title=0&byline=0&portrait=0`**, which clears Vimeo's top overlay so the expand button has a clean corner to sit in.

Clicking the `⤢` button on the focused film opens it in a lightbox at up to 1500px, where Vimeo's full control bar appears on its own and a `FULLSCREEN` button sits alongside the caption. The lightbox closes on Escape, backdrop click, or the `×`, and the player iframe is destroyed on close so audio stops immediately.

The lightbox's own fullscreen button is hidden on iPhone: iOS Safari has never supported the Fullscreen API on arbitrary elements, and the `<video>` it would need lives inside Vimeo's cross-origin iframe. iPhone visitors use Vimeo's own control instead. macOS and iPad Safari are fine, via the `webkit`-prefixed fallbacks in both the script and `styles.css`.

To add or replace a film, copy an existing `.film-slide` block, swap the Vimeo ID and titles, and add a matching `.film-dot` button — the carousel counts slides at runtime, so no other wiring is needed.

### Swipe, and why it needs a capture layer

Swipe listeners live on `.film-track`, but a cross-origin iframe consumes the pointer events over it, and the focused film's iframe is deliberately `pointer-events:auto` so Vimeo can run its own controls. On desktop that costs nothing — the focused slide is 54% of the track, so there is open ground either side to start a gesture on. On a phone the focused slide is **74%** of the track and only the slivers of the peeking neighbours were live, which left the arrows as the only way to move it.

`.film-swipe` is a transparent layer over the focused film, shown only under `@media(pointer:coarse)` so desktop behaviour is untouched. Its events bubble to the track, so one handler still serves both it and the open ground. Two details:

- **It stops 46px short of the bottom.** Vimeo's control bar lives there and stays directly usable — the layer would otherwise swallow scrubbing and the overflow menu. Measured against the phone-size player (229×129 at a 390px viewport, since `.container` keeps its 40px gutters all the way down): 46px lands on the bar's top edge.
- **It relays taps.** A tap that the layer intercepts would have reached the player, so the script forwards it as play/pause. Vimeo has no toggle method, so state is tracked in a `Map`, and the script subscribes to the player's own `play`/`pause` events over `postMessage` to stay honest when someone uses that exposed control bar.

Navigation needs horizontal intent — more than 40px of travel *and* more horizontal than vertical — so a diagonal flick while scrolling past the section doesn't move the carousel.

A play sent over `postMessage` carries no user activation into the player's origin, so the autoplay policy treats it as programmatic and Vimeo falls back to **muted** playback rather than not playing at all. The relayed tap therefore sends `setMuted:false` alongside the play — `setMuted`, not `setVolume`, which Vimeo documents as silently ignored on iOS and Android where volume belongs to the system. Only the first start of a given slide unmutes (tracked in a `WeakSet`), so someone who deliberately mutes with Vimeo's own control isn't overridden on the next tap.

The lightbox has the same problem by a different route: `autoplay=1` on a freshly created iframe is only ever granted muted on mobile. It unmutes on player load and once more on its first `play` event, because the muted fallback can land after `load`.

Playing muted is the browser's designed fallback, so neither path can be fully verified on desktop — desktop grants unmuted autoplay and never enters the failing state. Confirm on a real handset.

The same fix, and the reasoning behind it, is in the sibling Mountain Pine Media repo — where portrait films made the dead zone worse.

## Testimonials

A single centred card sits between **The Investment** and **Let's Talk**, filled in by hand from
reviews that arrive through [the review form](#review-form).

Two things about where it sits are load-bearing:

- **The background is `--cream-warm`, the same field as the team section.** Both sections are about
  people, and the change of ground seals off the gold contact CTA rather than letting the eye run
  straight into a third dark section before the footer. It also repeats a rhythm the page already
  establishes: About → Team → Approach runs cream → cream-warm → forest-deep, and
  Investment → Testimonials → Let's Talk now does the same.
- **`.contact` is `padding: 130px 0 60px`.** The short bottom exists because Let's Talk runs into
  the dark footer as one continuous field. Insert a section between them and that has to go back to
  `130px 0`, or the CTA sits cramped against the new boundary — and back again if it's removed.
  This has already been changed twice; check it after any reordering.

Two rules handle the shape of real review data rather than whatever is on the page today:

- **`.testimonial:only-child` centres a lone review** by spanning every grid column and capping its
  width. It stops applying by itself the moment a second review is added and the grid returns to
  three-up, so there's nothing to undo later.
- **`.testimonial-detail` has `min-height: 1.6em`.** Not every review arrives with a date and venue
  — Google reviews in particular usually don't. Cards stretch to the tallest in their row, so
  without a reserved line, one card missing that detail drops its hairline and name 24px below the
  rest. An empty `<span class="testimonial-detail"></span>` is deliberate markup here, not an
  oversight.

To add a review, copy an existing `<figure class="testimonial">` and swap the four values. Spell the
stars' `aria-label` out in words ("Five out of five stars") — a screen reader would otherwise read
the glyphs one at a time.

**Not yet added: `Review` / `AggregateRating` JSON-LD.** Worth doing once there are three or four
real reviews; a rating aggregated from a single one is thin and Google generally won't surface stars
for it. Marking up reviews that aren't real and verifiable is a manual-action risk against the whole
domain, so this waits for content rather than being stubbed out.

## Review form

`/reviews` is a standalone page (`public/reviews/index.html`) carrying a form that posts to
`/api/review` in [`worker.js`](web/worker.js), which emails the submission to
`weddings@lakeandpinecollective.com` **via [Resend](https://resend.com)** — the API key lives in
Worker secrets as `RESEND_API_KEY` (see [Deployment](#deployment)), never in the repo. The reply-to
is set to the submitter, so replying in the inbox reaches the couple. It exists so reviews arrive
in a shape that can go straight onto the site.

**The fields mirror the testimonial card exactly** — rating, quote, name, and the date/venue line.
The wedding date is a `month` input, so it yields `2026-04` and the Worker renders it as
`April 2026`, which is the form the card wants, so a review arrives ready to drop into the grid
rather than needing reshaping.

A few decisions worth keeping:

- **Consent is a checkbox and deliberately not required.** Forced consent isn't consent. The email
  states plainly whether it was given, with a badge that reads either way.
- **Its stylesheet and icon paths are relative (`../styles.css`), not root-relative.** A leading
  slash resolves to the filesystem root under `file://`, so the page opens unstyled when you
  double-click it — the same quick-tweak workflow the homepage supports.
- **The page is `noindex` and stays out of `sitemap.xml`.** A submission form has nothing to offer
  a search result and would only compete with the homepage.
- **Nothing on the site links to it, on purpose.** The path is handed out directly — texted or
  emailed to couples after their gallery lands — so only actual clients ever reach it. Together with
  `noindex` that makes the page effectively unlisted. A footer link would undo that, so don't add
  one without deciding to.
- **The honeypot field is positioned off-screen rather than `display:none`**, which the cruder bots
  check for. A submission that fills it gets a `200` and is silently dropped — telling a bot it was
  caught only helps it.
- **The form works without JavaScript.** It posts natively to `/api/review`; the Worker answers a
  form-encoded request with a 303 back to `/reviews/?sent=1` and JSON to everything else, and the
  page reads those parameters on load. With JS the submission resolves in place instead.
- **`.review-form[hidden]` needs its own rule.** `display: flex` beats the user-agent's
  `[hidden] { display: none }`, so without it the filled-in form stays on screen behind the
  success state.
- **The star rating keeps radios in natural DOM order** and fills them with `:has()`, so keyboard
  and screen-reader order match what's on screen. The reversed-sibling trick usually used for this
  gets that backwards.
- **Star and consent labels are scoped `.review-form .star` / `.review-form .consent`.** They are
  `<label>` elements, so an unscoped class selector loses to `.review-form label` and inherits the
  letterspaced micro-caps meant for field names.

Note that this collects testimonials for this site. It is not a Google review and builds nothing in
Google's local pack — that still needs a Google Business Profile. If a follow-up ever asks happy
submitters to repost to Google, send the same link to everyone: filtering by rating first is review
gating, which Google prohibits.

### The notification email

The template lives in [`web/email.js`](web/email.js), imported by both `worker.js` and the preview
script so a preview can never drift from what actually sends. Resend gets `text` and `html`
together and the client picks one.

**Preview it without sending anything:**

```bash
cd web
node preview-email.mjs --open     # renders three cases to web/.email-preview/ (gitignored)
```

Email is not the web, and three constraints shape the HTML:

- **Google Fonts do not load.** Gmail strips the `<link>` and Outlook ignores it, so Playfair and
  Cormorant are unavailable. The serif stack falls back to Georgia, which is on essentially every
  client and carries a similar high-contrast feel.
- **Styles are inline and the layout is tables.** Several clients drop `<style>` blocks, and desktop
  Outlook renders with Word's engine, which has no usable flexbox or grid.
- **The inner table needs `table-layout: fixed`.** Tables size to their content, so a single long
  unbroken line stretches the email well past its 600px max-width. `overflow-x: auto` does nothing
  in an email client.

**The email is written for the photographers, not for whoever maintains the site.** It reports a
review in readable form and stops there — it deliberately carries no markup to copy, since the
people receiving it have no use for that. Everything needed to build a testimonial card is in the
body anyway: rating, quote, credit, and the date/venue line.

Review text is still HTML-escaped into the body — `preview-email.mjs` includes a case with a
literal `<em>` and an ampersand in the review so that stays covered.

Not yet wired: Cloudflare Turnstile. The honeypot handles casual bots; Turnstile is the next step
if real spam arrives.

## Image workflow

Source photos from the camera are typically 5–10 MB each — far larger than what the web needs. Before adding new photos to the portfolio:

1. Drop the originals into the project-root `assets/` folder (kept out of the deploy).
2. Resize and recompress with ImageMagick into `web/public/optimized-assets/`:

   ```bash
   cd assets
   for f in your-photos.jpg; do
     magick "$f" \
       -auto-orient \
       -resize '1600x1600>' \
       -strip \
       -interlace Plane \
       -sampling-factor 4:2:0 \
       -quality 82 \
       "../web/public/optimized-assets/$f"
   done
   ```

   Settings: max 1600px on the long edge (still crisp on retina), JPEG quality 82, EXIF stripped, progressive encoding so images render top-to-bottom as they download.

3. Reference the new file from `public/index.html` using a path like `optimized-assets/your-photo.jpg`.

This pipeline reduced the photo grid payload from ~36 MB → ~1.4 MB (a 96% reduction) with no visible quality loss.

### The team portraits, and why they left the HTML

The three portraits used to be inlined into `index.html` as base64 `data:` URIs, which made the document ~329 KB rather than ~42 KB. They are now ordinary files — `optimized-assets/team-chava.jpg`, `-isma`, `-juan` — carrying `loading="lazy"` because the team section is below the fold.

They were **extracted byte-for-byte rather than re-exported**: at 900×1125 and quality 80 they already sit under the pipeline's 1600px ceiling, so `-resize '1600x1600>'` is a no-op and a re-encode at q82 only costs a generation. Measured, the whole pipeline moved the three files by 23 bytes.

Total transfer barely moved either, which is the part worth knowing before optimising anything else here — Brotli recovers almost all of base64's 33% inflation, so the two layouts are within ~2.5 KB of each other:

| | HTML (brotli) | images | total |
|---|---|---|---|
| inlined | 221.9 KB | — | 221.9 KB |
| as files | 8.8 KB | 215.4 KB | 224.4 KB |

The win is in *when* those bytes move, not how many:

- **The document is 96% smaller.** Everything after the team section in the source — the three Vimeo iframes, pricing, contact, and the inline `<script>` that wires the carousel and lightbox — used to sit behind 217 KB of portrait data in the byte stream.
- **A visitor who bounces at the hero never fetches them.**
- **They revalidate independently.** Cloudflare serves this site `public, max-age=0, must-revalidate`, so an unchanged file comes back as a 304 with no body. Inlined, the portraits shared the HTML's ETag — so every copy edit re-sent all 215 KB of them to every returning visitor. On a hand-edited site that deploys on push, that was the recurring cost.

No layout shift comes with the lazy loading: `.team-portrait-wrap` has `aspect-ratio: 4/5`, so the space is reserved whether or not the image has landed.

**Don't downscale them.** The card is 373px wide at desktop, but the grid goes single-column with `max-width:480px` below 900px — the *phone* gets the bigger slot. At 900px the source covers 2.4× at desktop and 1.9× on a mobile retina screen. A 750px export saves 51 KB and drops mobile to 1.6×.

Note that `assets/` holds no higher-resolution originals for these three — the 900px files are the only copies, so they are the masters as well as the exports.

## SEO & link previews

The `<head>` includes Open Graph and Twitter Card meta tags pointing at `og-image.png` (the company logo, 1200×1200), so the site renders a proper preview card when shared via iMessage, Slack, Twitter, Discord, etc.

Alongside those:

- **`LocalBusiness` JSON-LD** describing the collective, its service area (Reno, Sparks, Carson City, Gardnerville, Lake Tahoe, Washoe County, Northern Nevada), languages, and the photo/video services offered.
- **Canonical link** and a meta description.
- **`robots.txt`** allowing all crawlers and pointing at **`sitemap.xml`**. The sitemap has a single URL and a hardcoded `lastmod` — bump it when the content changes meaningfully.

The sitemap is single-URL by design. [`/reviews`](#review-form) is `noindex` and stays out of it —
it's a submission form handed directly to clients, not a page meant to be found.

Still open: **`Review` / `AggregateRating` JSON-LD** once there are enough real reviews to justify
it (see [Testimonials](#testimonials)). That's what puts star ratings under a search result.

Note that the biggest remaining wins for search visibility are off-site: a Google Business Profile
and Search Console verification. The review form feeds this site's testimonials; it builds nothing
in Google's local pack, which is a separate job.
