# Release verification — 7 September 2026

Verified the production Worker locally on macOS with Chrome, including a 390 × 844 touch profile and desktop views up to 1440 pixels wide. All records used in browser QA were synthetic or the explicitly labelled sample. The browser runner creates isolated contexts and closes them; recovery tests do not target an existing personal collection.

## Automated checks

`npm run check` passes TypeScript, focused lint, **102 tests** across collection/history domains, encryption, provider adapters, Discord protocol, PNG generation, SQLite transaction guards and offline caching. `npm run build` succeeds. The production dependency audit (`npm audit --omit=dev`) reports **0 known vulnerabilities** at verification time. Drizzle Kit brings four moderate development-tool advisories through its legacy esbuild toolchain; it is not imported by the deployed Worker.

The domain tests cover safe provider URLs, duplicate review and version boundaries, context-preserving merges, deterministic Tonight rules and latest manual session recency, date boundaries, offset timestamp normalization, strict backup round-trip/rejection, imported provenance, separate sample/personal stores, storage failure and repeat-import deduplication. A synthetic 5,000-record search and Tonight selection completed in approximately 23 ms locally; this is not a device-independent performance guarantee.

Service-worker regression tests reproduce full/blocked caches, preserve successful online responses when cache reads or writes fail, recover navigation from a cached shell, and exclude provider/authentication requests.

## Browser journeys

Run a production server on port 4173, then:

```sh
python3 scripts/run-browser-qa.py journey resilience motion mobile integrity karina
```

The runner requires Python 3, Node/npm, Playwright CLI and Chrome; `--cli` accepts the Codex wrapper path. Source scenarios and synthetic files are under `scripts/`. Local logs, exports, screenshots and recordings are under `output/playwright/` and are ignored by Git.

| Suite | Verified behaviour | Result |
| --- | --- | --- |
| Journey | Save Unicode music with context and a capsule; reload; actual provider popup without changing listen state; manual session; duplicate merge and undo; Tonight explanation; Atlas provenance/list; capsule reopen/duplicate/export; backup; lower effects; accent-insensitive search; narrow layout | Pass |
| Resilience | Invalid backup leaves data unchanged; explicit collection-delete confirmation; restore preview/recovery; ListenBrainz normalization and repeat-import deduplication; unconfigured provider fallback; quota failure retains draft; corrupted original preserved; cross-tab update; cold-first-visit cache and offline save/reload with network requests blocked | Pass |
| Motion | Spring hover and return to rest; native-scroll parallax; live reduced motion and lower-effects switch; keyboard detail opening and focus return; Tonight pin/dismiss; capsule depth/reopen; Atlas keyboard scrubber; bulk keep/undo; sample isolation; 200% root text enlargement without horizontal overflow | Pass |
| Mobile | Coarse pointer and real emulated touch scrolling; touch detail open/close; four spaces at 390 px; capsule writing/theme/order; local image permission/upload; independent sample reset | Pass |
| Karina | Real D1-backed consent import; exact statistics; changed-ID deduplication; account isolation; CSRF; unsigned Discord/job rejection; Spotify analytics gate; export/restore/delete; sample isolation; 3D drag and keyboard controls; reduced motion/table equivalent; all six mobile navigation items | Pass |
| Integrity | Quota errors remain visible inside capsule, memory and record overlays; 5,000 records render only 24 cards; browser search locates the intended record | Pass |

The 5,000-record browser check measured 63 ms from reload to hydrated collection and 19 ms from search fill to its result on this test machine. Figures include automation timing and are illustrative, not a benchmark or performance guarantee.

The WebMCP read/save tools were separately invoked in the Codex browser against the labelled sample. A valid Unicode record saved and could be read; invalid input returned an error. Registration is feature-detected and ordinary browsers do not require WebMCP.

## Visual and interaction review

Inspected empty, populated, Tonight, Atlas, capsule, editor and mobile screenshots, plus frames from the short interaction recording. The final pass tightened the populated crate header, made capsule graphics fill their frames, removed competing hover transforms, made notifications dismissible and retained undo in Settings. Motion does not tilt text or intercept scrolling. Production CSS can represent no motion as an identity matrix rather than the literal `none`; checks test the actual visual transform.

- [Desktop crate](evidence/crate-desktop.png)
- [Phone crate](evidence/crate-mobile.png)
- [Capsules](evidence/capsules.png)
- [Short interaction recording](evidence/interaction.webm)

An independent reviewer identified and verified fixes for context loss after record deletion, reminder/metadata merge loss, Tonight recency, stale-tab protection, import provenance/timestamp validation, first-load offline caching, cache-quota degradation and error visibility in overlays. The affected unit and browser checks were rerun.

## Scope of the evidence

- Phone testing uses Chrome touch emulation, not physical iPhone Safari. VoiceOver, every browser engine, device GPU/power behaviour and a full accessibility audit remain unverified.
- Reduced-motion behaviour, keyboard focus, touch controls and root text enlargement are tested; root enlargement is not a claim that every browser's text-only zoom has been audited.
- Offline use requires a successful initial visit and an available cache. Chrome's `navigator.onLine` can report true after a cached navigation even while requests are blocked; the offline test verifies failed network access and successful local work directly.
- Live MetaBrainz enrichment is deliberately disabled until real contact/service-use configuration exists. File import and disabled-provider recovery are tested; live upstream success, provider-specific 401/429 responses and commercial approval are not claimed as verified.
- Discord identity linking, user installation and live `/stats`, `/chart` and `/privacy` replies were verified in Karina’s own DM on 7 September 2026. The authenticated archive was empty: statistics and chart fallback delivery were verified, not real listening-data coverage or a populated image upload. Spotify and Last.fm credentials and unattended scheduling remain unconfigured. Their provider success, 401/429 handling and refresh rotation are tested with injected responses. There is no playback, playlist write or inferred listening time.
- Browser storage, undo and optimistic cross-tab checks are not cloud backup or transactional multi-user storage. See README and PROVIDERS for exact boundaries.


## Karina verification

All six browser suites passed against the finished production build. The expanded test suite checks forged/stale Discord signatures, the exact user-install contexts, public listening embeds, private account controls, response size/mention escaping, OAuth PKCE, encryption tampering, fixed refresh deadlines and provider timeouts. Seven real SQLite checks reproduce cancellation during OAuth, retained-account provenance, replay/expiry, orphan-job starvation and reauthorization during an in-flight history page. The optional relay compiles with Wrangler dry-run. The approved public Site hosts the live Discord endpoint directly; the relay is not required for this public endpoint. Test commands were sent only in Karina’s own DM.

Reviewed the 3D chart at desktop and phone widths and inspected the setup flow. Original count-driven columns retain weekday/hour axes; the table supports nonvisual access. Native scrolling is preserved outside the explicit draggable canvas. Source selection and available coverage stay visible. UI source wording was refined after the user clarified that Resonance owns the product and Last.fm is only a fallback bridge.

- [Desktop listening terrain](evidence/karina-terrain-desktop.png)
- [Phone listening terrain](evidence/karina-terrain-mobile.png)
- [Karina on phone](evidence/karina-mobile.png)
- [Setup flow](evidence/karina-setup.png)
- [Karina interaction recording](evidence/karina-interaction.webm)

Preview QA initially found a mismatched local database path and a stale Wrangler asset manifest after rebuilding. The start script now uses the initialized root persistence directory; restart the production preview after a rebuild. Tests were rerun against the restarted final build.

The final Karina rerun additionally verified two-page export of 1,001 unique records, browser download of a valid versioned backup, and automatic download fallback when an embedded browser rejects the native file picker. Native OS file-dialog interaction itself remains unverified. Coverage labels use UTC consistently with chart buckets, including a 23:00 UTC fixture that falls on the next calendar day in UK local time.

## Live Discord setup and runtime regression

Karina application `1546493242865094766` has 13 global user-install commands with contexts `[0, 1, 2]`. Discord accepted the public interactions endpoint, including its signed PING and invalid-signature probe. The owner authorized the OAuth identity connection; a fresh live callback saved the Discord connection successfully. The client secret is stored as a hosting secret and is not committed. `/privacy` visibly showed “Only you can see this”; statistics and chart replies were ordinary conversation-visible messages. Live group-DM and server delivery, every command, populated image uploads and additional users remain unverified.

A live OAuth test exposed that native Worker fetch rejects `redirect: 'error'`, although Node fetch and injected provider tests accept it. Outgoing provider, Discord, relay and metadata requests now use `manual`, and reject unsuccessful/redirect responses without following them or forwarding credentials. `node scripts/check-worker-network.mjs` runs the actual provider adapter in a Worker with a synthetic Discord service, verifying successful identity exchange and redirect rejection without real network access or secrets. Callback and delivery diagnostics contain only fixed stage/code/status fields.

An early live chart attempt stayed pending; after the runtime fix was deployed and refreshed, `/stats` and `/chart` completed in Karina’s own DM. Subsequent production logs contained no Karina callback or delivery errors during that verification window. This is evidence for the tested calls, not a claim about ongoing uptime.

## Website Spotify connection refinement

The visitor guide now offers Spotify, Discord and listening-history connection actions without developer instructions. The new Spotify playback endpoint requires the trusted signed-in identity, uses the same encrypted connection as Karina and does not archive snapshots. The callback verifies the immutable Spotify account ID instead of assigning the Resonance owner as a placeholder provider identity. Regression tests cover malformed identities, ignored email/mutable-ID fields, two separate owners and rejection of an attempted cross-owner Spotify link in actual SQLite. The native Worker network check also verifies the Spotify identity adapter against synthetic responses.

All 102 checks and the production build passed. In the built local browser, reviewed the anonymous connections screen, unavailable-provider states, three-step guide, privacy link and public privacy route. Live Spotify consent, playback, token refresh and an additional real visitor remain unverified until operator credentials are configured. The earlier six-suite browser evidence remains scoped to that earlier release; it is not a claim that the new connected playback panel has been exercised against a real account.
