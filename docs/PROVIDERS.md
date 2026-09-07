# Provider capability matrix

Verified against official sources on 7 September 2026. These are release boundaries, not a claim that RESONANCE has obtained provider approval.

| Adapter | Implemented capability | Default state | Remaining setup |
|---|---|---|---|
| User collection/journal | Local music, notes, tags, capsules, sessions and recovery | Functional | No account or service required |
| Provider links | Spotify, Apple Music, YouTube and Bandcamp HTTPS links with supported identifier/path validation | Functional | User supplies the exact recording link; availability is not inferred from syntax |
| MusicBrainz | Outbound search; optional server search for recording/release-group matches requiring user selection | Local saving and outbound search functional; live adapter disabled | Real contactable User-Agent, service-use confirmation, shared limiter before distributed hosting |
| ListenBrainz | JSON import, validation, deduplication, partial-coverage provenance; optional latest 1,000 public listens | File import functional; live adapter disabled | Real User-Agent and service-use confirmation; shared limiter before distributed hosting |
| Spotify API | Truthful unconfigured state | Not connected | Developer access, appropriate OAuth/scopes, reviewed policy and actual capability testing |
| Listening/audio | Explicit provider handoff and manual session logging | Functional | No playback or audio analysis claimed |

## MusicBrainz

The [API](https://musicbrainz.org/doc/MusicBrainz_API) supports public searches without an API key. Implemented fixed endpoints:

- `GET https://musicbrainz.org/ws/2/recording?query=...&fmt=json&limit=5`
- `GET https://musicbrainz.org/ws/2/release-group?query=...&fmt=json&limit=5`

Search fields are taken from the [official search reference](https://musicbrainz.org/doc/MusicBrainz_API/Search). Title and artist are escaped before constructing the query. Users select ambiguous matches; editing titles resets the field provenance to manual. The adapter imports only identifier/title/artist/disambiguation, not artwork, ratings or community mood tags.

A meaningful contactable User-Agent and no more than one request per second are required. MusicBrainz can rate-limit with 503. The adapter limits one server process to one request every 1.1 seconds, caches metadata and reports provider failure without blocking local work. See [identification and limits](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).

Core data is CC0; supplementary data is CC BY-NC-SA. Album artwork does not inherit the metadata licence. See [data licensing](https://musicbrainz.org/doc/About/Data_License). Commercial API access is a separate question from using CC0 data; [MetaBrainz commercial guidance](https://metabrainz.org/supporters/account-type) includes some pre-revenue startups. Confirm terms before enabling commercial service calls.

## ListenBrainz

The [public history endpoint](https://listenbrainz.readthedocs.io/en/latest/users/api/core.html) is `GET https://api.listenbrainz.org/1/user/{username}/listens?count=1000`. The normalizer accepts an API payload with `payload.listens`, a `listens` object or a raw listens array. It preserves timestamp/title/artist and a source-user key, counts invalid rows visibly and deduplicates repeat imports. It does not use Spotify content or infer audio features.

User listen data is CC0 under the [ListenBrainz terms](https://listenbrainz.org/terms-of-service/). Its [API requirements](https://listenbrainz.readthedocs.io/en/latest/users/api/index.html) require HTTPS, identification, rate limiting and response-header compliance. The adapter honors remaining/reset headers when supplied; no private journal or new listens are submitted. Partial history has a source and date span; gaps, missing services and listening minutes remain unknown.

The [JSON schema](https://listenbrainz.readthedocs.io/en/latest/users/json.html) distinguishes client-supplied metadata and server-resolved matching. This release does not silently attach guessed identifiers, durations or artwork to a user's records. Imports are labelled separately in Atlas.

## Spotify

The [July 2026 changelog](https://developer.spotify.com/documentation/web-api/references/changes/july-2026) exists and describes development quota changes. Current [quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) impose development owner/Premium/allowlist conditions and a separate extended-access process. Actual developer access for RESONANCE has not been configured or tested.

The [developer policy](https://developer.spotify.com/policy) constrains derived analytics, AI ingestion, playback, monetization, attribution and deletion. The application therefore ships exact saved-link handoffs and explicitly labelled search links only. It never presents a link click as listening, fetches audio, synchronizes a recording to visuals, or assumes audio-analysis access. Future user authorization must use appropriate OAuth, for example the [PKCE flow](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow) where applicable; an API key is not user consent.
