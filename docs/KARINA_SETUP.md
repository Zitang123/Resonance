# Karina: your own music companion for Discord

Resonance owns the listening archive, statistical calculations and visualizations. Karina is its original, self-hostable Discord application. Last.fm is a replaceable history bridge, not the product or an account system for Resonance. Listening commands post publicly in the conversation where they are invoked. Account linking, privacy and sync status are private. It uses user installation, so commands can appear in DMs, group DMs and eligible server channels. Discord permissions still apply.

The implementation has no subscription, billing or paid feature check. Hosting, storage and provider access still have their own quotas and conditions. This is a personal pilot, not a claim of complete .fmbot feature parity.

## What is implemented

| Feature | Status and source |
| --- | --- |
| `/fm`, `/nowplaying` | Current Last.fm now-playing marker; optional Spotify current-playing display. A recent completed listen is never substituted. |
| `/recent` | Latest recorded listens from the caller’s archive. |
| `/topartists`, `/toptracks`, `/topalbums` | Recorded play counts; 7, 30, 90, 365 days or all available history. |
| `/artistplays artist:…` | All-archive play count and first/last recorded timestamps. |
| `/discoveries period:…` | Artists first recorded during the selected period, with all-archive counts. This is not proof of the first time someone ever heard an artist. |
| `/stats` | Plays, artists, tracks and observed coverage; duration stays unknown when absent. |
| `/chart` | Original PNG heatmap attached publicly in Discord, plus the website link. No third-party artwork required. |
| `/sync`, `/connect`, `/privacy` | Private account controls. |
| Older Last.fm history | Paginated backfill of records Last.fm already holds, including before joining Resonance. No Resonance paywall. |
| Ongoing history | Last.fm polling with a durable cursor, retry delay and job lease. Runs while the site is closed only after deploying the relay’s scheduler. |
| Website statistics | Interactive 3D hour/weekday chart, table equivalent, daily trend, rankings, entropy, repetition, streaks, SVG download. |
| Import/export | Last.fm JSON, ListenBrainz JSON and Resonance backup; explicit upload consent; repeat-safe IDs; paginated account export with direct-to-file writing where supported. |
| Spotify lifetime export | Parser is tested, but upload/analytics are disabled pending verification of permission for this combined application. |
| Remaining .fmbot parity | Cross-user taste/WhoKnows/crowns, album-art collages, lyrics, genre/country datasets, arbitrary custom date commands, milestone notifications and service-specific supporter extras are not implemented. |

Command output follows familiar .fmbot conventions—now-playing embeds, numbered rankings, play counts and period/source footers—with original Karina presentation. It does not copy .fmbot’s assets or claim affiliation. Slash commands are used; reading arbitrary messages for dot-prefix commands is deliberately unnecessary for this version.

## 1. Website account and database

The website is public with the owner's explicit approval. Account archives require sign-in and use Sites’ trusted `oai-authenticated-user-id` identity, not a user ID supplied by the browser. `/signin-with-chatgpt` is the sign-in entry point. The server-backed archive is separate from the existing device-local crate and journal; those are never uploaded automatically.

Database binding: `DB` in `.openai/hosting.json`. Schema: `db/schema.ts`. Generated migrations: `drizzle/`. Sites applies the packaged migrations on publication. Never edit an applied migration; generate another migration for a change.

Local setup:

```sh
npm install
npm run db:local
npm run dev -- --hostname 127.0.0.1
```

For local provider tests, copy `.dev.vars.example` to `.dev.vars` and fill it privately. That file is ignored by Git. Local Sites sign-in is a development simulation, not production identity verification. If running outside Sites, replace the trusted-header boundary with a real authenticating gateway; never expose a bare server that accepts caller-supplied identity headers.

Friends can visit the public website, then sign in to link their own accounts. Discord installation and Resonance account linking are separate steps. Public website access does not expose another user's archive or grant provider access; developer-app allowlists and approvals still apply.

## 2. Create a Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create **Karina**.
2. Under **Installation**, enable **User Install**. Its default scope is **applications.commands**. No Administrator, bot scope, message-content intent or presence intent is needed for these HTTP slash commands.
3. Under **OAuth2**, register this exact redirect:

   `https://resonance-listening-room.zitang123.chatgpt.site/api/karina/callback/discord`

4. Copy the Application ID, Public Key and OAuth2 Client Secret into the host’s secret/environment settings below. Never paste secrets into chat or commit them.
5. For the current public website, set **Interactions Endpoint URL** to `https://resonance-listening-room.zitang123.chatgpt.site/api/karina/interactions` after configuring and publishing the Discord keys. Discord checks the signed PING response before accepting it. The site validates the signature itself; no separate Cloudflare account is needed for Discord commands. Use the relay in step 5 if you later restrict website access, or want its background scheduler.
6. Register commands globally after User Install is enabled. The included definitions use `integration_types: [1]` and `contexts: [0, 1, 2]`: servers, bot DMs and private channels/group DMs.

Preview the registration payload:

```sh
npm run karina:commands
```

Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` in the shell environment, then explicitly register:

```sh
npm run karina:commands -- --publish
```

The script requests a client-credentials token with `applications.commands.update` and creates/updates only the named Karina commands. It does not bulk-delete unrelated commands. It sends no chat messages.

In Resonance, **Connect Discord** verifies your identity with OAuth2 `identify` only. **Add to my Discord** is a separate `applications.commands` user installation. Run `/connect` in Discord if you have not linked yet. Global-command propagation and availability are controlled by Discord.

References: [installation contexts](https://docs.discord.com/developers/resources/application#installation-context), [command contexts](https://docs.discord.com/developers/interactions/application-commands#interaction-contexts), [OAuth2](https://docs.discord.com/developers/topics/oauth2), [receiving interactions](https://docs.discord.com/developers/interactions/receiving-and-responding).

## 3. Spotify listening through a temporary history bridge

The preferred long-term product is direct Spotify connection. Under the currently documented Spotify API and developer policy, the promised unrestricted statistics and lifetime history cannot be delivered that way. The user has explicitly authorized Last.fm as a fallback. This adapter supplies records; every archive, calculation, chart and Karina command is implemented in Resonance. Export-based use is also possible without an active Last.fm connection.

1. The deployment owner creates a [Last.fm API account](https://www.last.fm/api/account/create) once for the intended use. Ordinary visitors never need developer credentials. Register this callback:

   `https://resonance-listening-room.zitang123.chatgpt.site/api/karina/callback/lastfm`

2. Review the [Last.fm API terms](https://www.last.fm/api/tos) for this deployment. They include conditions on commercial use, attribution and public pages; obtain applicable permission before public rollout. Set `LASTFM_ENABLED=true` after this review.
3. To record Spotify listening through Last.fm, use [Last.fm Applications settings](https://www.last.fm/settings/applications) to connect Spotify there.
4. In Resonance, choose **Connect Last.fm**. The signed `auth.getSession` exchange establishes the account identity. Credentials are encrypted on the server.
5. Choose **Sync listening history**. While the page stays open, Resonance imports successive pages automatically. **Pause import** stops requests from this page; saved pages remain and **Sync listening history** resumes. The first pass reads existing history in pages of 200, with a fixed upper timestamp. Charts explicitly show that backfill is incomplete. The scheduled relay can continue when the page is closed.

After backfill, each incremental cycle freezes a fresh upper cutoff when its first page begins. It checks a two-day overlap from the newest recorded timestamp, deduplicates exact records and advances its durable cursor. Later pages retain the cycle cutoff so new listening cannot shift pagination. Old scrobbles added or edited outside that window are not automatically reconciled. To rebuild a corrected archive, export first, delete the Last.fm archive, reconnect and backfill. Deletion stops that connection and invalidates pending authorization so it cannot silently restore the data.

The scheduled relay processes one due page every five minutes. Large initial archives take time; the website can request extra pages subject to the shared provider cooldown. Hosting/database failure does not advance the cursor. Rate limits delay retries. The UI shows the last successful page and the latest scheduler heartbeat. A manually authenticated job check also writes that heartbeat, so use timed requests or timer status to verify unattended operation.

The API terms include a 100 MB application-wide Last.fm Data allowance. Migration 0003 adds an atomic 80 MB budget for normalized UTF-8 archive records with conservative row overhead, leaving headroom for other Last.fm data. It applies across accounts and both upload and connected imports. Duplicate records do not consume the budget twice; deletion releases capacity. A full budget pauses new imports without deleting existing history, and scheduled retries back off for a day. This guard is not permission to exceed the provider's allowance or to launch a commercial/public data service; larger usage and applicable public-page use require the provider's written permission.

We cannot recover listening that Last.fm never recorded. Last.fm’s current-playing marker is transient and excluded from historical counts. Actual listening minutes are unknown for these API scrobbles.

References: [web authentication](https://www.last.fm/api/webauth), [recent tracks and pagination](https://www.last.fm/api/show/user.getRecentTracks). Provider artwork is not used.

## 4. Runtime settings

Manage production settings in Sites; local `.env`/`.dev.vars` files do not configure production. Republish a saved version to apply changes.

| Setting | Value |
| --- | --- |
| `RESONANCE_ORIGIN` | Exact website origin, without a trailing path. |
| `KARINA_TOKEN_KEY` | Independent random 32-byte key encoded as 64 hex characters. Secret. |
| `KARINA_JOB_SECRET` | Another independent random secret of at least 32 characters. Secret; same value in the relay. |
| `LASTFM_API_KEY` | Last.fm API key. Secret. |
| `LASTFM_SHARED_SECRET` | Last.fm shared secret. Secret. |
| `LASTFM_ENABLED` | `true` only after reviewing the intended API use. Default disabled. |
| `DISCORD_CLIENT_ID` | Discord Application ID. |
| `DISCORD_CLIENT_SECRET` | Discord OAuth2 client secret. Secret. |
| `DISCORD_PUBLIC_KEY` | Discord Application Public Key. |
| `SPOTIFY_CLIENT_ID` | Shared Spotify application ID. S256 PKCE does not require a client secret. |
| `SPOTIFY_CLIENT_SECRET` | Optional confidential-client authentication; when supplied it stays server-side. |
| `SPOTIFY_DISPLAY_ENABLED` | Default `false`. Enable only after access and combined-use review. |

Generate keys with a password manager or `crypto.randomBytes(32).toString('hex')` in a private local console. Do not print them in shared logs. Losing or rotating `KARINA_TOKEN_KEY` makes existing encrypted connections unreadable; disconnect and reauthorize or implement a deliberate key migration. Never silently generate a new key at runtime.

## 5. Optional relay and background job

The public website can receive Discord commands directly. The separate, small Cloudflare Worker in `karina-worker/` adds a background scheduler and, when needed, a receiver for a private website. Its receiver validates Ed25519 over the exact request timestamp and raw body before forwarding to the fixed Resonance interaction path. Resonance verifies the signature again, resolves the actual invoking Discord user and deduplicates interaction IDs. The relay supports Sites authentication if website access is later restricted; public website access does not remove the scheduler requirement for unattended history updates.

Use your own Cloudflare account and review its current quotas. The Worker has no signup or billing dependency embedded in Resonance. Store secrets in Wrangler/Cloudflare secret settings:

```sh
npx wrangler secret put KARINA_JOB_SECRET --config karina-worker/wrangler.jsonc
npx wrangler deploy --config karina-worker/wrangler.jsonc
```

Configure `DISCORD_PUBLIC_KEY` in the relay only when using its optional interaction receiver. For the current public website, omit `SITES_BYPASS_TOKEN`; the scheduler needs only the narrowly scoped `KARINA_JOB_SECRET`. If the Site later becomes private, configure the optional `SITES_BYPASS_TOKEN` from the hosting integration. It is sent only in `OAI-Sites-Authorization: Bearer …` and grants broader Site access. Transfer it directly between trusted secret stores, never into the browser, repository, public URL or chat message. Do not expose other relay routes or allow arbitrary forwarding destinations.

The replacement scheduler uses one SQLite-backed Durable Object, `KarinaClock`, to call `/api/karina/jobs` every five minutes. It stores only its next alarm, last attempt and HTTP status; all listening records remain in Resonance. It arms a safety alarm before making a request, then measures the normal five-minute delay from completion so it cannot arrive before the Site's cooldown ends. Downstream outages cannot exhaust a finite retry sequence and permanently stop the timer. The authenticated job handler uses D1 job leases and a shared rate-limit timestamp. Normal Discord commands acknowledge with a defer and finish by editing the original interaction response within Discord’s token window. Errors after a public defer remain generic because Discord cannot change that response into an ephemeral one. No unsolicited messages or proactive DM notifications are sent.

Starting this timer requires an operator bootstrap. With explicit deployment approval, temporarily enable `workers_dev`, deploy, and make an authenticated `POST /scheduler` using `KARINA_JOB_SECRET` in the Authorization Bearer header. `GET /scheduler` with the same header returns timing and result status. Repeated POSTs do not postpone an existing alarm. Disable `workers_dev` and deploy again after starting and verifying the timer; the persisted alarm continues without an open URL. The committed configuration keeps public URLs disabled. Never put the secret in a URL or visitor-facing setup flow. Do not rename the object class or singleton identity after initialization without migrating or stopping the previous timer.

The original cron implementation remains available in the Worker code, but the replacement configuration has no cron trigger to avoid redundant wakeups. The original production cron was registered successfully but had no observed automatic requests during setup. The owner approved and activated the replacement alarm on 7 September 2026. Its first autonomous request reached Resonance with HTTP 200, and the temporary setup URL was then disabled. See QA.md for the current live evidence.

The current public installation uses the Site endpoint directly. Discord’s signed endpoint verification, the owner’s identity link and user installation, and live /stats, /chart and private /privacy responses in Karina’s own DM were verified on 7 September 2026. After the owner linked Last.fm through Resonance, populated seven-day statistics and an actual chart image also completed in that DM. Other users, group DMs and server delivery still need live verification. See QA.md for dated import and scheduler evidence and the Worker fetch regression test.

## 6. Optional Spotify display and archive limits

The current deployment uses Resonance application `9f0238ce5bba4ed0bbfabcda68fbfb92`. The owner approved the developer agreement and completed real Spotify authorization through the public Resonance website. The website and Karina's own DM verified empty playback and the same real playing track, artists and Spotify link. Live refresh and additional real users remain to be verified. The steps below are operator reference for another deployment, not work ordinary visitors must do.

The deployment owner creates one Spotify developer application for Resonance, using the public site URL, `/privacy` data-use page and this exact callback:

`https://resonance-listening-room.zitang123.chatgpt.site/api/karina/callback/spotify`

Configure the shared client ID in Sites, then enable `SPOTIFY_DISPLAY_ENABLED` after access/use review. The documented S256 PKCE flow supports both token exchange and refresh without a client secret; the verifier and user tokens still stay encrypted on the server. Ordinary visitors sign in to Resonance and choose **Connect Spotify**; Spotify handles their consent and password. The callback verifies Spotify’s immutable `account_id`, stores only the identity/display name and encrypted tokens, and rejects a Spotify identity already linked to another Resonance owner. Developer setup no longer appears in the visitor guide.

The website playback panel and Karina use the same owner-scoped connection. Playback is checked on demand rather than continuously polled or inserted into the archive. The connection is rechecked around upstream requests so disconnect/relink cancels stale display results. The public data-use page describes sharing, retention and disconnect behavior.

Spotify OAuth asks only for `user-read-currently-playing` and uses S256 PKCE. Access tokens are refreshed server-side and replacement refresh tokens are retained. The current documentation describes a six-month refresh lifetime for new Dashboard applications; the implementation preserves the original authorization deadline and requires reauthorization when it expires. Disconnecting deletes the encrypted tokens; users can also revoke access in Spotify’s account settings.

New development apps currently require a Premium app owner and support at most five allowlisted users. Extended quota is a separate approval route. OAuth success does not guarantee API access for a user not on the allowlist. These are provider access conditions, not a Resonance subscription.

Spotify’s recently-played API is not a lifetime export. Spotify’s account data export can include Extended Streaming History, but the developer policy’s analytics restriction and broad definition of Spotify Content make unrestricted archive analytics in this combined developer application unresolved. Therefore the tested parser is not exposed as an enabled import or analytics source. There is no switch that silently bypasses this boundary. Do not rename Spotify API data as Last.fm or ListenBrainz data.

References: [authorization](https://developer.spotify.com/documentation/web-api/tutorials/code-flow), [refresh tokens](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens), [current playing](https://developer.spotify.com/documentation/web-api/reference/get-the-users-currently-playing-track), [quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), [data exports](https://support.spotify.com/uk/article/understanding-your-data/), [policy](https://developer.spotify.com/policy), [terms](https://developer.spotify.com/terms).

## Design and validation

The interface applies readable hierarchy, restrained surfaces and purposeful motion informed by [OpenAI’s frontend guidance](https://developers.openai.com/api/docs/guides/frontend-prompt). It uses original mathematical graphics rather than pretending to analyze audio. The 3D chart is driven only by explicitly sourced timestamp counts, is manipulable by pointer and keyboard, and has a table equivalent. No OpenAI API or paid AI call is required.

Run `npm run check`, `npm run build`, and the browser suites described in `docs/QA.md`. Test provider authentication with real credentials in a development application before inviting users. Public website publication is not proof that live provider connections or Discord delivery have been tested.


Large archive exports fetch 1,000 records per request to avoid per-invocation database query limits. Browsers supporting the File System Access API write directly to the selected file; others create a download in browser memory and are subject to device memory limits. Export from a desktop browser for very large archives. Original history formats are identified explicitly on import; exporting does not grant permission to reclassify restricted provider data.
