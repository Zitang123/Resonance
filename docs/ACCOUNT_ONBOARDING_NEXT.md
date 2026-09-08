# Account onboarding

Implemented 8 September 2026. The user explicitly deferred lifetime-history uploads.

## Visitor flow

- Anonymous: Continue with ChatGPT, or explore a clearly labelled sample.
- First sign-in: create an owner-scoped room, optionally connect Spotify or link Discord, then Enter my room.
- Returning visitor: restore their saved room. Account & settings centralizes sign-out, optional connections, backups, room clearing and account-data deletion.
- Older device collection: show record/capsule/moment counts and request explicit ownership confirmation. Save only into an empty account, verify read-back, retain the original for recovery. Replayed saves cannot overwrite an existing account.

Ordinary visitors do not configure developer apps or provide keys. Last.fm remains an optional statistics bridge. Lifetime Spotify-history uploads remain unimplemented and deferred.

## Identity and provider boundary

The current [official Sites guide](https://learn.chatgpt.com/docs/sites#add-sign-in-with-chatgpt) supports optional ChatGPT sign-in on public Sites. Resonance preserves its existing stable per-Site user IDs, including archives and Discord links. Every protected operation resolves ownership server-side. Browser requests also carry their expected account so stale tabs cannot write to or export a newly signed-in account.

Direct Google, Apple or Spotify login is not configured. Official Sites documentation mentions external identity providers as a supported site shape but does not document a concrete integration mechanism. Confirm that path before implementation. Never merge provider accounts by email. Spotify's existing connection verifies its immutable account ID; it links playback permission to an existing Resonance account. [Spotify quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) currently limit development access to approved users.

## Persistence and recovery

Personal records, moments, capsule writing and preferences are partitioned in D1, with transactional compare-and-set revisions. Capsule image documents are in private R2 and only returned through authenticated room reads. The sample stays device-local. No navigation HTML, account responses or private images are cached by the service worker.

Account deletion atomically removes room data, archives, connections, pending OAuth claims and sync jobs, while recording image cleanup work. The existing scheduler retries unavailable image storage. Revision guards prevent delayed collection saves, browser history imports and OAuth initiation from restoring deleted data. Recreated rooms receive a new revision. Backups/exported files, retained legacy device copies and already-posted Discord replies are outside server deletion.

Tests are recorded in docs/QA.md. No claim of unrestricted Spotify public access or direct social-login availability.
