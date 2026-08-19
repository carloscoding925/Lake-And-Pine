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
│   └── optimized-assets/      # Web-ready portfolio images (resized + recompressed)
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

**One exception:** the three team portraits are not files — they're inlined into `index.html` as base64 `data:` URIs, which is why the HTML is ~320 KB rather than ~30 KB. Inlined images can't be cached separately from the page or lazy-loaded, and they block the HTML parse, so new photos should go through the pipeline above rather than following the portraits' example.

## Films

The three highlight films live in a centre-focus carousel: the active film sits dead centre with its neighbours peeking either side, and the ends wrap around. Arrows, dots, arrow keys, and horizontal swipe all move it. Only the focused film is playable — clicks on a neighbour pull it into focus instead.

Two things about the layout are load-bearing and shouldn't be changed casually:

- **`.film-slide` is `54%` wide** (~648px on desktop). Vimeo's control bar is responsive: below roughly 620px it collapses fullscreen, quality, and PiP behind an overflow chevron, so the player has to stay above that width for the fullscreen button to appear inline. Measured behaviour — 576px collapses, 600px shows volume only, 624px shows the full bar.
- **Embeds carry `title=0&byline=0&portrait=0`**, which clears Vimeo's top overlay so the expand button has a clean corner to sit in.

Clicking the `⤢` button on the focused film opens it in a lightbox at up to 1500px, where Vimeo's full control bar appears on its own and a `FULLSCREEN` button sits alongside the caption. The lightbox closes on Escape, backdrop click, or the `×`, and the player iframe is destroyed on close so audio stops immediately.

The lightbox's own fullscreen button is hidden on iPhone: iOS Safari has never supported the Fullscreen API on arbitrary elements, and the `<video>` it would need lives inside Vimeo's cross-origin iframe. iPhone visitors use Vimeo's own control instead. macOS and iPad Safari are fine, via the `webkit`-prefixed fallbacks in both the script and `styles.css`.

To add or replace a film, copy an existing `.film-slide` block, swap the Vimeo ID and titles, and add a matching `.film-dot` button — the carousel counts slides at runtime, so no other wiring is needed.

## SEO & link previews

The `<head>` includes Open Graph and Twitter Card meta tags pointing at `og-image.png` (the company logo, 1200×1200), so the site renders a proper preview card when shared via iMessage, Slack, Twitter, Discord, etc.

Alongside those:

- **`LocalBusiness` JSON-LD** describing the collective, its service area (Reno, Sparks, Carson City, Gardnerville, Lake Tahoe, Washoe County, Northern Nevada), languages, and the photo/video services offered.
- **Canonical link** and a meta description.
- **`robots.txt`** allowing all crawlers and pointing at **`sitemap.xml`**. The sitemap has a single URL and a hardcoded `lastmod` — bump it when the content changes meaningfully.

Note that the biggest remaining wins for search visibility are off-site: a Google Business Profile and Search Console verification.
