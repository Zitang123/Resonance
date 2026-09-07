# Design and motion rationale

The user asked for a premium music companion, then explicitly raised the bar toward the precision of OpenAI and Apple, with cinematic motion, hover tweening, parallax and scroll effects. RESONANCE keeps its own identity rather than copying logos, fonts or trade dress.

## Research applied

“Not vibe coded” is a quality criterion, not a formal aesthetic standard. Our interpretation is a product with deliberate hierarchy, complete interactions, consistent geometry, specific content and controlled motion.

- [OpenAI frontend guidance](https://developers.openai.com/api/docs/guides/frontend-prompt): usable product first, avoid generic heroes, unnecessary floating section cards, nested containers, filler copy and unstable sizing. Applied through open sections, fewer labels, music above the fold and actual functional objects.
- [OpenAI UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines): controlled spacing, type and actions. Its embedded-widget font rules do not bind a standalone app; RESONANCE keeps a limited editorial serif for music and memories.
- [OpenAI brand guidance](https://openai.com/brand/): proportion, space and typographic care informed restraint; no OpenAI assets are used.
- [Apple motion](https://developer.apple.com/design/human-interface-guidelines/motion): purposeful, brief, interruptible and optional effects. Native scrolling and immediate actions remain in charge.
- [Apple typography](https://developer.apple.com/design/human-interface-guidelines/typography) and [scroll views](https://developer.apple.com/design/human-interface-guidelines/scroll-views): readable hierarchy, familiar gestures, stable context.
- [NN/G's AI prototype evaluation](https://www.nngroup.com/articles/ai-prototyping/): observed weak grouping, contrast and inconsistent margins inform the visual review checklist. A component library itself is not evidence of poor design.

## Tokens and composition

Charcoal `#171717`, deeper rail `#131313`, ivory `#f1f0eb`, copper `#dfc1a5`, spectral blue focus `#b1c3cd`. System sans for controls and navigation; Georgia for selected record, capsule and memory headings. Spacing uses a primarily 4/8-pixel rhythm with optical adjustments. Borders separate information; actual records and capsules are the main visual objects. No analytics dashboard or endless recommendation feed.

Focus rings are explicit. Meaningful state is visible in the collection and preserved in storage, independent of the status message. Text enlargement, keyboard navigation and touch controls are part of QA. Original procedural covers are deliberately identified as abstract graphics, never represented as authentic album art.

## Motion system

- A Canvas standing-wave ribbon responds to pointer/touch and scrolling, then settles. It represents interaction, not music or audio analysis.
- A scoped motion hook uses exact critically damped spring integration for artwork rotation, lift and a quiet reflected highlight. Stable wrappers supply geometry so text never tilts.
- Decorative parallax uses cached page-relative bounds, a clamped travel of up to 32 pixels and native scroll events. No scroll interception or smoothing replacement.
- Native View Transitions connect a record cover with its detail cover when supported. Closing and other controls remain interactive; unsupported browsers use the ordinary sheet transition.
- Typical control response is 140–180 ms; route/detail transitions 220–320 ms. The original ribbon and capsule focus receive longer settling only when appropriate.
- One shared frame loop for the card system stops at rest. The ribbon has a separate bounded loop; both pause in hidden tabs and outside the viewport. Reduced motion and the lower-effects switch are live controls.

Motion is tested in context, not judged by the number of effects. Native touch scroll remains available over artwork; mobile gets a short press response. The app is quiet and contains no sound effects.
