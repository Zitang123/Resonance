# Resonance project context

Read README.md, docs/PRODUCT_BRIEF.md and docs/DESIGN.md before continuing. This repository began empty on 7 September 2026 with an existing GitHub remote. The user explicitly authorized ongoing commits and pushes and asked for independent subagent implementation/review.

## Product truth

A real local-first music companion: Capture → choose → open provider → remember → rediscover. Six implemented spaces: Crate, Tonight, Atlas, Capsules, Listening and Karina. The first four remain device-local; the listening archive is account-backed in D1. No Spotify credentials or AI calls are required. The personal and sample stores must never mix. Sample notes/activity are fictional and clearly labelled.

The user repeatedly requested a higher visual bar: clean OpenAI/Apple-inspired precision plus expressive motion graphics, parallax, hover tweening and cinematic continuity. Preserve functional work while refining design. Do not turn this into a generic landing page, card dashboard, mockup or pretend streaming player.

## Engineering boundaries

React/TypeScript/Vinext starter, reusable Base UI primitives, procedural SVG/Canvas, native browser APIs. Domain and provider adapters are separate from rendering. Browser storage is local, quota-limited and origin-specific, never a cloud backup. Backups are versioned and strictly validated; invalid storage is not overwritten implicitly. User data does not belong in logs, telemetry, public exports or provider requests.

Spotify link handoff remains available; optional encrypted OAuth supports current-playing display only, disabled until setup and access/use review. Spotify export analytics are explicitly blocked in the API pending verified permission. MetaBrainz live calls stay disabled in distributed hosting until the real contact/service terms/shared rate limiting are configured. ListenBrainz JSON imports work now and must retain their provenance and incomplete coverage. Never estimate minutes, count clicks as listening, or infer emotions/audio features.

## Continue safely

1. Inspect git status and preserve unrelated edits.
2. Run npm run check and npm run build for relevant changes.
3. Test actual built-browser flows at a disposable origin, including recovery and reduced motion.
4. Read docs/QA.md for evidence and unresolved limits.
5. Commit and push meaningful verified milestones to the configured origin; do not force-push.

The Sites manifest owns one project ID. Reuse it; do not create duplicate sites. On 7 September 2026, the user explicitly approved keeping the existing public access and publishing the Karina update. Account archives still require authentication and are scoped to their owner. Live provider setup, provider approvals and demand remain open questions. No billing was added.

## Karina expansion, 7 September 2026

### Next phase requested after Discord is working

Finish and verify the current Discord connection before starting this phase. The user explicitly requested a normal multi-user Resonance service: each visitor reaches their own signed-in account or a clear sign-in/create-account flow; individual collections, journals, archives and connections persist separately. Investigate Google, Apple and Spotify sign-in using verified provider support, with safe account linking and recovery. Ordinary users must never create developer applications or supply API keys; deployment-wide provider setup belongs to the operator. Keep provider consent simple and distinguish sign-in from permission to import listening data. Strengthen and verify account isolation, authorization, session security, privacy defaults, export and deletion. Preserve existing device-local work through an explicit migration flow. Do not ship fake social-login buttons or claim a provider works before its credentials and live flow are verified. The user permits a bounded subagent assignment for this later phase.

The user wants a Resonance-owned equivalent to Last.fm/.fmbot including free history-driven features, not a Last.fm client. They explicitly allowed Last.fm as a fallback where Spotify alone cannot provide the promised features. Current Spotify policy restricts derived statistics and API access does not yield lifetime history; use the Last.fm adapter as a replaceable history bridge, while Resonance implements storage/analytics/visuals. Do not pretend the bridge is a direct Spotify connection.

Karina must work in DMs, group DMs and eligible servers using global USER_INSTALL commands (integration_types [1], contexts [0,1,2]). Listening/statistics/chart replies are PUBLIC in the invoking conversation. /connect, /privacy and /sync controls remain private. No arbitrary other-user lookup, unsolicited messages, or message-content intents.

Discord application Karina (1546493242865094766) was created with the user’s explicit approval. Its secret is stored in the hosting secret store, 13 commands are registered, Discord validated the public endpoint, and live identity linking, user installation and /stats, /chart and private /privacy replies were verified in Karina’s own DM. Spotify/Last.fm configuration and unattended scheduling remain unfinished; no complete .fmbot premium parity claim. The user explicitly approved keeping the existing public Site audience and publishing. See docs/QA.md for precise tested limits.

New code: lib/karina (history, statistics, providers, AES-GCM, Discord protocol, PNG renderer, SQL guard helpers); app/api/karina; components/karina; db/schema.ts; immutable generated drizzle migrations; karina-worker signature-verifying relay and 5-minute cron; scripts/register-karina.ts dry-run default. No raw original export uploads or journal sync. See docs/QA.md for measured checks.

Critical guards: claim OAuth state with used=1, retain it through provider exchange, and gate the final atomic writes on that still-valid claim. Disconnect/delete removes claims; keep archive_owners after disconnect to stop account mixing. Sync insertion and checkpoints must require the captured connection version; orphan jobs must not starve other accounts. Actual durations are unknown for Last.fm/ListenBrainz scrobbles. Sources are never pooled.
