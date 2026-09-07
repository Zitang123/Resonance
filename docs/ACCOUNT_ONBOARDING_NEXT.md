# Account onboarding — next phase

Requested by the owner after Karina's live Discord connection was complete. Read-only assessment completed on 7 September 2026; this document does not claim the following work is implemented.

## Product outcome

Every visitor sees their own account or a clear sign-in/create-account page. Collections, listening memories, capsules and archives persist separately across devices. Connecting music is a normal consent flow. Only the operator configures developer applications and secrets.

## Current boundary

Listening archives and Discord links already use the authenticated Sites user ID. Crate, Atlas, Capsules and preferences still use an origin-wide device-local `resonance:personal:v1` key in `lib/resonance/use-collection.ts`; changing sign-in does not change that collection. Device-local storage must be migrated explicitly, never silently attributed to the first person signing in.

## Smallest implementation

1. Add one account endpoint and identity resolver. Preserve existing owner IDs and Discord/archive ownership. Future login identities need a unique provider/subject mapping; never merge by email.
2. Store owner-scoped collection records, moments, capsules and revision metadata in D1. Store uploaded capsule images privately in R2. The existing backup may reach 16 MB, so it cannot be placed in one D1 row; the [D1 row/string limit is 2 MB](https://developers.cloudflare.com/d1/platform/limits/).
3. Replace personal-mode local persistence with authenticated loading and revision-checked writes. Await persistence in editors and WebMCP tools before reporting success. Keep the labelled sample separate.
4. Offer a counted preview of existing device work, then idempotent migration. Retain the original until server save and read-back succeed. Resolve conflicts explicitly.
5. Clear rendered data, pending requests and undo state immediately on account change. Add sign-out, full account export/deletion, safe unlinking and recovery.
6. Move deployment/API-key instructions out of ordinary visitor flows into operator documentation. Show only real, configured connection choices.

## Authentication prerequisites

The bundled Sites authentication reference documents dispatch-owned ChatGPT sign-in and stable per-Site IDs. It requires confirming the supported platform path before app-owned public/external authentication. Available connector tools do not establish Google/Apple/Spotify support; absence of a tool is not proof of impossibility.

- **ChatGPT:** existing supported identity can establish separate durable accounts without another developer app.
- **Google:** operator OAuth client, consent setup and registered redirects; verify OIDC tokens and use `sub`. [Official OIDC guide](https://developers.google.com/identity/openid-connect/openid-connect).
- **Apple:** primary App ID, Services ID, website/return URLs and signing key; the web usage guidelines also require an App Store app. [Web configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/), [usage requirements](https://developer.apple.com/sign-in-with-apple/usage-guidelines-for-websites-and-other-platforms/).
- **Spotify:** operator developer app, real identity lookup and approved audience. The current callback stores the Resonance owner as `externalId`; this is not a Spotify login identity. Reverify current `/me` identity fields before implementation. Development-mode access limits prevent promising unrestricted public Spotify onboarding. [Profile API](https://developer.spotify.com/documentation/web-api/reference/get-current-users-profile), [2026 access changes](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).

No fake social-login buttons. Reverify provider requirements before setup; distinguish authentication from permission to access listening data.

## Acceptance checks

Verify two-user read/write/export/image isolation; forged ownership fields; account switching with requests in flight; stale revisions; replayed migration; deletion versus late OAuth/sync; unlinking the final login method; private image access. Update `public/sw.js` before adding personalized server-rendered pages: it currently caches successful navigation HTML without account separation or checking `no-store`.

Primary surfaces: `app/page.tsx`, `lib/resonance/use-collection.ts`, editors/settings, `components/karina/karina.tsx`, shared server identity, new account/collection/image routes, `db/schema.ts`, append-only migrations, `.openai/hosting.json` for R2, and `public/sw.js`.
