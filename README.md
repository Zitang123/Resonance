# Resonance

**Find your next listen. Remember why it mattered.**

[Open Resonance](https://resonance-listening-room.zitang123.chatgpt.site)

A private music companion built with TypeScript, React, and Vinext. Capture recommendations, choose a listen, record a memory, and give music a place in a capsule. No streaming account or AI calls are required for the core application.

## Run locally

Use Node 22.13+ for the application; Node 24+ for the built-in TypeScript test runner (development verified with Node 25).

```sh
npm ci
npm run db:local
npm run dev
```

Open the printed local address, normally `http://localhost:3000`. Start with your own collection or the explicitly labelled sample. `N` opens Save music; `/` focuses crate search outside an editor. All ordinary controls support keyboard navigation.

```sh
npm run check
npm run build
npm run start -- --port 4173
```

`check` runs TypeScript, focused lint, domain, encryption, provider, Discord protocol, SQLite race-regression and offline-cache tests. `start` serves the built Worker locally. The production build enables the offline service worker; development intentionally does not cache source modules.

## What works

- Crate: manual tracks/albums, validated provider links, optional metadata matching, context, personal tags, statuses, revisit dates, duplicate review, grid/list, search, filters, pagination, bulk archive/keep/capsule assignment, editing and deletion.
- Tonight: deterministic picks based on oldest untried saves, due revisits, and the last manually logged session/revisit. Mixed/familiar/unexplored modes, personal tag filtering, pin/dismiss/replace and explicit explanations.
- Atlas: collection events and authored memories, manual sessions/revisits, separately labelled ListenBrainz imports, timeline/list, date scrubber, filters and monthly comparisons.
- Capsules: writing, ordered music, themes, optional images, editing, keyboard/touch reordering, duplication, reopening and a standalone printable HTML export.
- Recovery: separate personal/sample storage, 10-step session undo, strict versioned JSON backups, restore preview, storage failure handling, cross-tab updates and an optimistic stale-write check.
- Motion: procedural standing-wave ribbon, spring-driven artwork tilt and reflection, decorative scroll parallax, native view-transition continuity, short route/control transitions, reduced-motion and lower-effects modes.

- Listening: an account-backed archive, consent-based imports, source-separated statistics, interactive 3D hour/weekday chart, rankings, trends, diversity, repetition, streaks and chart/history exports.
- Karina: user-installed Discord slash commands for DMs, group chats and eligible servers; public listening embeds and PNG charts, private account controls, website-based provider connections and resumable history sync. Discord identity linking, user installation and empty-archive replies are verified live in Karina’s own DM. Unattended history sync still needs its scheduler.

## Karina and the listening archive

Resonance owns the archive, calculations and presentation. Last.fm is the current fallback history bridge for Spotify listening because Spotify's documented API access and developer policy do not support the unrestricted Spotify-only promise. The optional direct Spotify connection is gated display-only. The user explicitly authorized the bridge only where required; keep Resonance as the product identity.

[Exact setup, capability matrix and remaining limits](docs/KARINA_SETUP.md). There is no Resonance subscription or premium gate. This is not full .fmbot parity, and external service/hosting conditions still apply. Discord and Spotify are configured; the owner’s live Spotify website authorization, empty playback, and matching playing-track display in the website and Karina’s `/fm` are verified. Visitors authorize their own connections through Resonance and never supply developer keys. Spotify development access is limited to approved users. Direct Spotify playback is not archived as listening statistics. Last.fm operator setup and unattended history scheduling remain pending.

## Local data and privacy

Crate, Tonight, Atlas and Capsules data is stored in this browser under `resonance:personal:v1` and `resonance:sample:v1`. It is not synced or uploaded. Clearing browser/site data removes it. **Export a backup in Settings regularly.** Different browsers, devices, ports and deployment domains have separate collections; export/restore moves your collection between them. The website is public; account archives and provider connections require sign-in and are isolated in D1 by the trusted user identity. Local Sites sign-in simulates identity for development. Imported listening history is uploaded only after explicit consent; the crate and private journal remain on the device. See the public [data-use page](https://resonance-listening-room.zitang123.chatgpt.site/privacy).

The schema starts at version 1. Backups reject unsupported future versions, invalid nested data, unsafe URLs and broken references before replacing anything. A future schema change must add a deliberate migration rather than weakening validation. Failed writes leave the last saved collection unchanged. Corrupted raw storage can be downloaded from Settings before explicit recovery.

Image uploads are limited to 1 MB because browser storage is limited. Storage quotas vary. Undo history is in memory and disappears on reload; it is cleared after an update from another tab. The optimistic conflict check reduces stale-tab overwrites but is not a multi-writer database transaction; avoid simultaneous edits in multiple tabs.

Opening a provider is never a listening event. Durations and actual playback coverage remain unknown. A memory does not count as a manual listening session. ListenBrainz imports do not silently create saved records or mark recommendations tried.

## Optional providers

See [the capability matrix](docs/PROVIDERS.md). The app starts without credentials and the live MetaBrainz adapter is disabled by default. File-based ListenBrainz import and outbound provider/search links work without a server integration.

The read-only adapter accepts only a provider kind and validated music fields/username. It never fetches arbitrary pasted URLs. To use it on one local server, configure an actual contact and explicitly enable it after checking the service terms:

```sh
RESONANCE_PROVIDER_CONTACT='https://your-real-contact-page.example' \
RESONANCE_ENABLE_PROVIDERS=true npm run dev
```

Replace the example with a real contact URL/email. Commercial usage arrangements may be required even before revenue. Do not enable the in-process limiter on a distributed deployment without a shared rate limiter and confirmation of applicable service terms. The default hosted preview keeps this adapter disabled.

## Structure

- `lib/resonance`: domain types, safe links, deterministic rules, validation and persistence.
- `components/resonance`: the four product spaces, editors and shared presentation.
- `hooks/use-room-motion.ts`: scoped spring/parallax lifecycle, separate from application data.
- `app/api/providers`: fixed-host read-only MetaBrainz adapter.
- `public/sw.js`: versioned same-origin offline shell cache; excludes provider APIs.
- `docs`: product intent, design rationale, integration boundaries and QA evidence.

The original abstract covers and ribbon are editable procedural graphics in `components/resonance/art.tsx`. They are not album artwork or audio visualizations. Capsule exports include user writing and original graphics; imported third-party artwork and uploaded images are omitted.

## Browser verification

The five saved scenarios exercise the real UI in new, isolated browser contexts containing only synthetic data. Run a production server on port 4173 first, then use Python 3, Google Chrome and Playwright CLI:

```sh
python3 scripts/run-browser-qa.py journey resilience motion mobile integrity
```

The runner uses `npx @playwright/cli`; install the browser support requested by its setup if needed. Codex environments can pass `--cli /path/to/playwright_cli.sh`. Every suite closes its disposable profile, and artifacts go to `output/playwright/`. No recovery test targets an existing user collection. See [QA evidence and limitations](docs/QA.md) for coverage, screenshots and a short recording.

## Current boundaries

No playlist writing, embedded playback, collection/journal sync, telemetry, billing, audio extraction, inferred listening minutes or AI pipeline. Optional Spotify OAuth supports gated current-playing display only; Karina account linking and the separate listening archive are implemented with setup still required. ListenBrainz history is partial and its date span is not a claim of continuous coverage. The sample's notes and activity are fictional, explicitly labelled and independently resettable.

See [project context](PROJECT_CONTEXT.md) before continuing development.
