# Resonance project context

Read README.md, docs/PRODUCT_BRIEF.md and docs/DESIGN.md before continuing. This repository began empty on 7 September 2026 with an existing GitHub remote. The user explicitly authorized ongoing commits and pushes and asked for independent subagent implementation/review.

## Product truth

A real local-first music companion: Capture → choose → open provider → remember → rediscover. Four implemented spaces: Crate, Tonight, Atlas and Capsules. No Spotify credentials or AI calls are required. The personal and sample stores must never mix. Sample notes/activity are fictional and clearly labelled.

The user repeatedly requested a higher visual bar: clean OpenAI/Apple-inspired precision plus expressive motion graphics, parallax, hover tweening and cinematic continuity. Preserve functional work while refining design. Do not turn this into a generic landing page, card dashboard, mockup or pretend streaming player.

## Engineering boundaries

React/TypeScript/Vinext starter, reusable Base UI primitives, procedural SVG/Canvas, native browser APIs. Domain and provider adapters are separate from rendering. Browser storage is local, quota-limited and origin-specific, never a cloud backup. Backups are versioned and strictly validated; invalid storage is not overwritten implicitly. User data does not belong in logs, telemetry, public exports or provider requests.

Spotify is link handoff only. MetaBrainz live calls stay disabled in distributed hosting until the real contact/service terms/shared rate limiting are configured. ListenBrainz JSON imports work now and must retain their provenance and incomplete coverage. Never estimate minutes, count clicks as listening, or infer emotions/audio features.

## Continue safely

1. Inspect git status and preserve unrelated edits.
2. Run npm run check and npm run build for relevant changes.
3. Test actual built-browser flows at a disposable origin, including recovery and reduced motion.
4. Read docs/QA.md for evidence and unresolved limits.
5. Commit and push meaningful verified milestones to the configured origin; do not force-push.

The Sites manifest owns one project ID. Reuse it; do not create duplicate sites. The hosted preview is owner-private. Public release, provider approvals and demand remain open questions. No billing was added.
