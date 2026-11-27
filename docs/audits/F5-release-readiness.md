# F5 release readiness

This report preserves the initial artifact measurements and release candidate checklist. Use the [current hosting guide](../verification.md#hosting-the-production-build) for distribution commands and regional checks after F6-B1.

## Production identity and discovery

- **Name and title** — SoFarAway. The homepage title is **SoFarAway — A Procedural Rhythm Runner**.
- **Description** — Four worlds. Four soundtracks. Thread the gates and ride the beat in a browser rhythm runner with entirely runtime-generated graphics and music. By LibreCosta.
- **Tagline** — A hypnotic browser rhythm runner. Thread the gates, ride the beat.
- **Canonical** — `https://sofaraway.librecosta.com/`, including when the game is opened with a volume or diagnostic query.
- **Sharing** — Open Graph and the large-image Twitter Card use the original in-game AURORA capture from the F4-P4 1080p High fixtures. A centered 1200×630 crop is delivered as a 60,269-byte JPEG at `/social/orbit-aurora.jpg`. It is referenced by metadata and used in the README. The SVG favicon and uppercase menu wordmark retain their existing appearance. [Screenshot](../../public/social/orbit-aurora.jpg) · [Capture settings](F4-P4-orbit-procedural-cosmic-optimization.md)
- **Indexing** — The sitemap lists only the canonical homepage. The Explorer overview, all eight labs, the legacy route and the old audio exporter keep their prerendered `noindex` directives. `robots.txt` allows crawlers to read them. Both distributions use the same English canonical metadata. [Google's noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- **Public references** — `/llms.txt` links to play, Technical Explorer, source and license. `/.well-known/security.txt` lists `contact@librecosta.com`, English and an expiry of 26 November 2027 at 00:00 UTC. Its optional Canonical field is omitted so the same file applies to both origins. [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html)

## Repository and artifact

The README leads with the game and Explorer and keeps the volume table, controls, Showcase and source instructions. The history index links recent validation while preserving original milestones and documentation screenshots. Contributor instructions point to private security reporting. Ignore rules cover local build environment files, EdgeOne state and scratch verification files. BSD-3-Clause, the font notices and the generated bundled-dependency notices remain part of distribution.

The verified `build/client` contains 106 files totaling 1,910,387 bytes before transfer compression. These include the game homepage, ten prerendered Explorer documents including Legacy, the custom 404, the old audio redirect, the four Explorer cover images, the favicon and social image, the four discovery and disclosure files, three license texts, bundled dependency notices and 77 hashed assets (67 JS, five CSS and five WOFF2). Static host control files `_headers` and `edgeone.json` are generated from the same build. The artifact allowlist excludes the harness, reports, development files, source maps and the SPA fallback. Existing repository and package identifiers and public file paths remain in use.

## Distribution

Use Node 24 LTS, run `npm ci` and `npm run build`, then use `build/client` on both hosts. Keep `index.html`, `404.html`, the provider control files and `.well-known/` at the artifact root.

- **Cloudflare Workers Static Assets** is the international production target selected in F6-A0. Use the `sofaraway` Worker and `main` as the production branch. The root Wrangler configuration serves prerendered routes and the custom 404. Its generated `_headers` gives emitted fingerprints one year of immutable browser caching and keeps the game, Explorer and mutable public assets on revalidation. [Workers static routing](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/) · [Workers asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- **EdgeOne Pages** receives the same prebuilt output through a China Direct Upload project. The generated `edgeone.json` keeps mutable paths on revalidation and stays below the provider's 30-header limit. Hashed assets use the provider's built-in one-year browser TTL. Verify the actual cache headers and 404 behavior on the selected project before release. [EdgeOne cache rules](https://pages.edgeone.ai/document/configuring-cache) · [EdgeOne configuration](https://pages.edgeone.ai/document/edgeone-json#headers)

There is no checked-in deployment workflow. See [exact host settings and build commands](../verification.md#hosting-the-production-build). Hosting project settings and production deployments are F6 work.

## Verification

- On Windows 10 with Node 24.22.1 and Chrome 158.0.8127.37, `npm run test:release` passed type checking, the production build and all seven static smoke cases. The first attempt timed out at the known intermittent `/debug/lighting/` prerender step. The retry produced all 11 route documents and the complete artifact.
- Checks covered direct routes and query-preserving redirects, custom 404s for pages and missing chunks, ETag revalidation, MIME types, licensing and the artifact allowlist. They verified the homepage metadata and decoded social image before hydration, the Explorer child routes' `noindex`, the homepage-only sitemap and the delivered disclosure files. The generated Cloudflare and EdgeOne files have 93 and 16 header rules respectively.
- Four focused Chrome cases passed against the same artifact for the menu and Credits, static homepage branding, the old audio exporter link and the Interface studio. Relative links in the changed documentation and `git diff --check` passed. F5 used the existing performance milestone results.

The local artifact has no outstanding release blocker. Live provider behavior, final China domain and compliance, and owner approval remain open for F6.

## F6 release candidate checklist

- [ ] Owner approves the release revision and the proposed `v1.0.0` version.
- [ ] Confirm the China domain, applicable compliance details and target projects. Configure HTTPS and bind the approved domains.
- [ ] Verify direct routes, trailing-slash and query behavior, custom 404 status for unknown pages and chunks, MIME types, one-year browser caching for valid hashed files and revalidation for mutable files on both hosts.
- [ ] Verify the international canonical, crawler directives, social preview and public discovery files over HTTPS. Confirm the reporting inbox and refresh the security contact expiry before it becomes stale.
- [ ] Smoke-test input, audible gameplay and Technical Explorer on target devices. Update the GitHub description, which still presents the older 128 BPM-only description.
- [ ] Approve final notes and publish the tag and GitHub Release in F6.

## Release notes draft for v1.0.0

SoFarAway is a procedural rhythm runner by LibreCosta. Thread the gates and ride the beat through ELSEWHERE, DAYBREAK, DESCENT and ORBIT, each with its own soundtrack synthesized in the browser. Fly in Standard, explore at a slower pace in Sightseeing, or let Showcase pilot the Impossible course along the route you choose. The Technical Explorer lets you inspect the same worlds, gate geometry, lighting, music and systems that power the game. Source is available under the BSD 3-Clause License.
