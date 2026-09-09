# Lake & Pine Collective

Static marketing site for **Lake & Pine Collective**, a wedding photo and film collective based in the Reno-Tahoe area. The site is a single-page portfolio with sections for the team's story, approach, photo and film work, packages, and contact details. Enquiries go through a `mailto:` link rather than a form, so there's no backend to run.

Live at [lakeandpinecollective.com](https://lakeandpinecollective.com).

## Tech stack

The site is intentionally simple — no build step, no framework — so it stays fast and easy to maintain.

- **HTML / CSS / vanilla JS** — single `index.html`, single `styles.css`, and one inline `<script>` covering the sticky-nav scroll state, the mobile hamburger toggle, reveal-on-scroll animations via `IntersectionObserver`, the film carousel, and the film lightbox.
- **Google Fonts** — Playfair Display, Cormorant Garamond, and Inter, loaded via `<link rel="preconnect">` for fast first paint.
- **Vimeo** — highlight films are embedded via Vimeo's iframe player rather than self-hosted, so we get adaptive-bitrate streaming, a polished player, and no Cloudflare bandwidth cost for video (see [Films](#films)).
- **Cloudflare Workers** — deployment target, using Workers static assets. Configured via [`wrangler.jsonc`](web/wrangler.jsonc) with `assets.directory: "."` so the `web/` folder is served as the site root.
- **ImageMagick** — local CLI tool used to resize and recompress portfolio photos before deploy (see [Image workflow](#image-workflow)).

## Project structure

```
Lake-And-Pine/
├── assets/                    # Original full-resolution photos (NOT deployed — kept for re-processing)
├── web/                       # Everything in here is what gets deployed
│   ├── index.html
│   ├── styles.css
│   ├── wrangler.jsonc         # Cloudflare deploy config
│   ├── favicon.ico            # Browser tab icon (multi-size 16/32/48)
│   ├── apple-touch-icon.png   # iOS / iMessage icon (180×180)
│   ├── og-image.png           # Open Graph link preview (1200×1200)
│   ├── robots.txt             # Allows all crawlers, points at the sitemap
│   ├── sitemap.xml            # Single-URL sitemap (update lastmod on content changes)
│   └── optimized-assets/      # Web-ready portfolio images and team portraits
└── README.md
```

The split between `assets/` (project root) and `web/optimized-assets/` is deliberate: only files inside `web/` are served by Cloudflare, so the high-resolution originals never ship to the public site but stay available locally for re-processing.

## Local development

Serve the `web/` folder with any static server:

```bash
cd web
python3 -m http.server 8000
# then visit http://localhost:8000
```

For a closer-to-production preview that mirrors the Cloudflare environment, run wrangler from inside `web/` so it picks up `wrangler.jsonc`:

```bash
cd web
npx wrangler dev
```

`open web/index.html` also works for quick layout and copy tweaks, but serve over HTTP when testing the film players or the lightbox — they talk to Vimeo across origins, which behaves differently from `file://`.

## Deployment

Pushes to the `main` branch trigger an automatic build and deploy of the `web/` directory to Cloudflare.

## Image workflow

Source photos from the camera are typically 5–10 MB each — far larger than what the web needs. Before adding new photos to the portfolio:

1. Drop the originals into the project-root `assets/` folder (kept out of the deploy).
2. Resize and recompress with ImageMagick into `web/optimized-assets/`:

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
       "../web/optimized-assets/$f"
   done
   ```

   Settings: max 1600px on the long edge (still crisp on retina), JPEG quality 82, EXIF stripped, progressive encoding so images render top-to-bottom as they download.

3. Reference the new file from `index.html` using a path like `optimized-assets/your-photo.jpg`.

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

## SEO & link previews

The `<head>` includes Open Graph and Twitter Card meta tags pointing at `og-image.png` (the company logo, 1200×1200), so the site renders a proper preview card when shared via iMessage, Slack, Twitter, Discord, etc.

Alongside those:

- **`LocalBusiness` JSON-LD** describing the collective, its service area (Reno, Sparks, Carson City, Gardnerville, Lake Tahoe, Washoe County, Northern Nevada), languages, and the photo/video services offered.
- **Canonical link** and a meta description.
- **`robots.txt`** allowing all crawlers and pointing at **`sitemap.xml`**. The sitemap has a single URL and a hardcoded `lastmod` — bump it when the content changes meaningfully.

Note that the biggest remaining wins for search visibility are off-site: a Google Business Profile and Search Console verification.
