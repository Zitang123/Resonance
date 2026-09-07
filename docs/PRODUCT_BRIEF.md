# RESONANCE — A Premium Music Companion

## Your role and delivery responsibility

Act as principal engineer, product designer, motion designer, and delivery owner.

Build RESONANCE: a polished music companion that helps people collect recommendations, decide what to hear, rediscover meaningful music, and preserve personal musical memories.

Take responsibility for implementation, integration, visual quality, accessibility, testing, and documentation. Make reasonable reversible decisions independently. Explain consequential trade-offs briefly.

Use supported subagents for independent research, implementation, and review. Keep architecture and integration under your ownership. Start with at most three parallel assignments, each with clear file ownership and acceptance criteria. Increase concurrency only when it materially helps.

Use relevant skills and available tools deliberately. Create reusable project tools when they solve an actual problem. Do not install every plugin, fabricate access, or call ordinary tool use AGI.

Inspect the repository before changing it. Preserve existing work. Turn planning into implementation during the active session.

## 1. Product promise

“Find your next listen. Remember why it mattered.”

The target user loves music, already has a streaming service, and accumulates recommendations across conversations, messages, playlists, and memory.

The recurring problems:
- Recommendations disappear into an unstructured backlog.
- Saved songs lose the context that made them interesting.
- Choosing what to hear becomes repetitive.
- Favourite music from earlier periods gets forgotten.
- Listening statistics rarely explain personal significance.

Build around this loop:

Capture → choose → listen in the preferred service → remember → rediscover.

Make the application useful on the first visit without requiring a streaming account connection or an existing listening archive.

## 2. The first experience

Offer two clearly separated entry points:
- Start my collection.
- Explore a labelled sample collection.

Let me paste a music link or enter a title and artist. Ask only for optional context: “Who recommended this?” or “Why save it?”

Within the first minute, I should be able to save something, place it in a collection, and open it in my streaming service.

Use a short visual transition into my personal collection. Avoid a long cinematic introduction before I can do anything.

Never mix sample activity into real statistics.

## 3. Four core spaces

### A. Crate — capture music with context

Support tracks and albums, pasted links, manual entry, and verified metadata lookup where available.

Each saved item can contain:
- Title and artist.
- Item type and provider links.
- Date saved.
- Who recommended it, entered by the user.
- A short personal note.
- User-defined tags.
- Status: saved, tried, keep, or archived.
- Optional revisit date.

Make saving fast. Keep detailed editing available afterward.

Detect likely duplicates without incorrectly merging live versions, remasters, and different recordings. Offer merge or keep-separate controls.

Provide excellent search, filters, bulk organization, undo, and keyboard navigation.

### B. Tonight — choose something worth hearing

Present a small, intentional selection rather than an endless feed.

Use explainable rules based on the user’s own collection:
- An older recommendation they have not marked as tried.
- Something they explicitly wanted to revisit.
- An item matching a chosen personal tag.
- A favourite they have not logged recently.

Show why each suggestion appeared.

Let the user choose familiar, unexplored, or a mixture. Support dismiss, replace, and pin.

Do not claim to infer a song’s energy, instrumentation, emotional effect, or suitability from unavailable audio analysis. Mood labels must come from the user or an explicitly permitted source.

Generate these selections deterministically. The core experience must not require an LLM.

Each recommendation needs a clear “Open in Spotify” or other verified provider action. Opening a link is not proof that a listen occurred.

### C. Atlas — explore your musical life

Create a beautiful interactive timeline using user-authored memories and independently permitted listening records.

Offer:
- A chronological view.
- An accessible list equivalent.
- Filters by artist, personal tag, collection, and date.
- A comparison between selected periods where data supports it.

Let me open a moment and see the associated music, notes, and collection.

Default statistics should describe activity RESONANCE genuinely records: items saved, recommendations tried, revisit actions, and manually logged sessions.

Optional listening-history integration may add richer statistics only when its source and permitted use are verified.

Label provenance and coverage. Distinguish manual logs, imported listens, and collection activity. Do not present these as interchangeable.

Never estimate listening minutes from link clicks or multiply play counts by assumed track durations. Missing history must appear as unknown.

### D. Capsules — give music a place in your life

Let me create a small collection around a period, person, event, or theme.

Examples:
- My first month at university.
- Songs a friend introduced me to.
- Late-night journeys.
- Albums I want to return to.

A capsule includes ordered music references, my writing, optional images I am entitled to use, and a chosen visual theme.

Support editing, reordering, duplication, export, and reopening.

Make capsules private by default. Build a polished export using my own writing and original graphics. Include third-party artwork only where its use is permitted.

Do not require a social network for capsules to be useful.

## 4. Data and provider architecture

The application must remain functional without Spotify API credentials.

Implement separate adapters for:
1. User-created collection and journal data.
2. Music metadata.
3. Optional listening-history sources.
4. Optional Spotify integration.

Track source and permissions at field level where necessary. Do not merge restricted provider data into an unrestricted analytics or AI pipeline.

Investigate MusicBrainz for metadata and ListenBrainz for optional listening history and statistics. Verify current service terms, commercial conditions, identification requirements, rate limits, and actual endpoints.

Do not automatically publish private journal entries or listens to another service.

Use verified identifiers where possible. Preserve unresolved entries and let users correct matching mistakes.

Start with manual entries and safe links. Add external enrichment without making saving depend on an upstream service being available.

References:
- https://musicbrainz.org/doc/MusicBrainz_API
- https://listenbrainz.readthedocs.io/en/latest/users/api/index.html

## 5. Spotify integration and playback boundaries

Verify current Spotify documentation and actual app access before promising features.

Use Spotify initially for permitted metadata and listening handoffs. Add playlist export or playback only when access and applicable terms support the intended use.

Do not derive analytics from Spotify content, ingest it into AI, extract its audio, synchronize recordings with visuals, or assume audio-analysis endpoints are available.

Keep required attribution and links. Honour disconnection and deletion requirements.

Use proper OAuth for user access; an API key alone is not user authorization. Keep secrets out of the browser and logs.

Treat public access approval and streaming monetization as unresolved dependencies, not guaranteed capabilities.

If playback cannot be enabled, preserve an excellent “Open in Spotify” experience and report the limitation honestly.

References:
- https://developer.spotify.com/policy
- https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- https://developer.spotify.com/documentation/web-api/references/changes/july-2026

## 6. Visual identity

Design RESONANCE as a contemporary listening room: intimate, tactile, precise, and quietly cinematic.

Use:
- Charcoal and warm-black surfaces.
- Ivory text with carefully controlled contrast.
- Restrained copper and spectral-blue accents.
- Editorial typography for collection titles.
- Highly readable interface typography.
- Fine texture, soft depth, and selective translucency.
- Original abstract graphics where artwork is unavailable.

Keep real album art intact and legible. Place visual treatments around it rather than distorting the image.

Use generous spacing and strong hierarchy. Dense collection views must still work efficiently.

Create a compact design system covering typography, colour, spacing, surfaces, controls, focus states, chart semantics, and motion.

The application must feel cohesive on a Mac laptop and an iPhone-sized screen. Avoid a desktop layout merely squeezed into mobile.

## 7. Signature motion and interactive waves

Make motion expressive and useful.

### Resonance ribbon

Create an original procedural ribbon inspired by standing waves and vibrating strings.

It responds to pointer movement, touch, scrolling, and selected interface state. Let users gently displace it and watch it settle.

It is an interaction-driven visual motif, not an audio waveform or a claim to measure the playing song.

Use it selectively in the collection overview and capsule transitions.

### Object continuity

When opening an item, animate its visual container into the detail view so the user retains spatial context.

Keep the animation interruptible and preserve focus correctly.

### Collection depth

Use subtle perspective and parallax when browsing capsules. Supply equally effective touch and keyboard interactions.

### Timeline navigation

Give the Atlas an expressive date scrubber with readable dates and stable selection. Prevent decorative physics from making precise navigation difficult.

### Responsive feedback

Use coherent motion for saving, undoing, filtering, and moving items. Explain success through a visible state change rather than a temporary notification alone.

Default timing direction:
- Immediate feedback within roughly 100–180 ms.
- Ordinary transitions around 180–320 ms.
- Occasional focal transitions around 450–650 ms.

Tune these through actual interaction. Avoid scroll hijacking, forced waiting, excessive blur, flashing, and constant background motion.

Provide reduced-motion and lower-effects modes. Pause animations in hidden tabs and outside the viewport.

Sound effects should default off. Keep the companion quiet while people listen to music.

## 8. Engineering approach

Choose the simplest maintainable stack that supports the experience. A suitable starting point is TypeScript, React, a motion library, and a narrowly scoped Canvas or WebGL component for the ribbon.

Use semantic HTML for ordinary controls and content. Do not render the whole interface inside a canvas.

Verify current library documentation before relying on version-specific APIs. Use available website-building skills when applicable.

Build the first release with local persistence, versioned data migrations, backup/export, and restore. Make storage limitations clear. Do not claim local browser storage provides cloud backup.

Use a backend only for necessary provider integrations or later account synchronization. Validate inputs, restrict outbound provider requests, and protect credentials.

Do not fetch arbitrary pasted URLs server-side. Parse supported providers and validate identifiers.

Keep provider adapters, domain logic, persistence, and rendering separate enough to test and replace.

Build ordinary search and selection without paid AI calls. Any later AI feature must use eligible data, provide explicit user control, and solve a problem better than the deterministic implementation.

## 9. User trust and meaningful states

Design complete states for:
- Empty collection.
- Missing artwork.
- Ambiguous music match.
- Unsupported link.
- Offline use.
- Provider outage.
- Rate limiting.
- Expired authorization.
- Incomplete listening coverage.
- Import failure.
- Storage failure.
- Successful recovery.

Keep existing local work usable during provider failures.

Allow users to inspect, correct, export, and delete their data. Offer undo for ordinary destructive collection actions.

Demo mode must be visually identified and independently resettable.

## 10. Delivery sequence

1. Inspect the environment and verify provider feasibility.
2. Establish the visual system and one fully implemented save-to-listen journey.
3. Complete Crate and Tonight with persistence and explainable selection.
4. Complete Capsules and Atlas using real user-authored data.
5. Add the verified optional history adapter and Spotify enhancements.
6. Polish motion, accessibility, responsiveness, performance, and recovery.

Continue through milestones without requiring me to approve routine engineering decisions.

Do not stop after a landing page, static mockup, or dashboard containing fictional data.

If credentials block an integration, complete the functioning core, implement truthful connection states, and document the exact remaining setup.

## 11. Verification and completion

Verify:
- Save → organize → select → open provider → log a memory → rediscover.
- Reload persistence.
- Duplicate handling.
- Unicode titles and artist names.
- Timezone and date boundaries.
- Statistics against known fixtures.
- Import repetition without double-counting.
- Export and restore.
- Offline use and provider failures.
- Keyboard access and reduced motion.
- Mobile touch controls.
- Representative performance with thousands of saved entries.

Test actual browser interactions. Inspect screenshots and short recordings. Check that beautiful transitions do not interrupt typing, lose focus, block navigation, or misrepresent state.

Use a separate reviewer for concrete defects where subagents are available. Fix findings and rerun the affected checks.

Deliver:
- A working application.
- Editable source code and original visual assets.
- Reproducible setup instructions.
- A concise integration capability matrix.
- Evidence of tested journeys.
- Clear remaining limitations.
- Persistent project notes for future development.

Treat business demand as a hypothesis. The first product test is whether users voluntarily save music, return to Tonight, and revisit their collection. Do not add billing before the core experience earns repeat use.

Begin implementation after the initial inspection. Own the result as a senior engineer and product designer.