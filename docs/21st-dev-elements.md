# Odyssey: 21st.dev enhancements

The existing ocean artwork, teal backgrounds, copper accents, cream text, and Cormorant Garamond typography establish the visual direction. The existing site already has a substantial GSAP entrance layer, a pinned hero, mission transitions, a page-spanning journey line, and cabinet reveals. This pass adds graphics and interaction within that structure.

## Placement and source

| Location | Finding | Enhancement | Source |
| --- | --- | --- | --- |
| Homepage hero | The large centered panel has empty flanks around the title. | Fine copper wave contours frame the title, move on arrival, and respond to the pointer. A clear center preserves text legibility. Existing cabinet number and school year appear in the upper corners on desktop. | [Wave Background by xubohuah](https://21st.dev/@xubohuah/components/wave-background), demo 1823; source retrieved via MCP. |
| Mission | Long bilingual text and the existing journey line already use the center of the frame. | Low-opacity waves at the outer edges extend the ocean identity without overlaying the body copy. | Reuses the retrieved Wave Background adaptation. |
| Four policy links | The links are visually quiet relative to their importance. | Numbered entries and a copper spotlight responding to the pointer; keyboard focus remains explicit. | [Spotlight Card by preetsuthar17](https://21st.dev/@preetsuthar17/components/spotlight-card), demo 2220; source retrieved via MCP. |
| Events | Desktop leaves unused space to the right of the chronological list. | Oversized month numerals brighten as the corresponding event enters the reading area. On phones the original compact dates remain. | Small extension of the existing timeline, using existing dates. No replacement timeline engine. |
| Closing logo band | A small square logo repeats the hero without a strong closing composition. | A larger circular logo with a fine outer ring and wave contours on either side. | Reuses Wave Background and the existing logo. |
| Documents | Existing resource cards need clearer interaction feedback. | Copper spotlight with pointer tracking and keyboard focus. | Reuses Spotlight Card. |
| Services, Activities, Campus, Joint-School | Headers and listing cards should feel related to the enhanced homepage. | Wave accents at header edges and the same spotlight on existing listing cards. | Reuses both retrieved components. |

## Adaptation details

This is a static HTML site. Components were adapted into native JavaScript and CSS rather than introducing React, Tailwind, or a build pipeline.

- Waves retain the source's SVG point/path construction and damped cursor displacement model. Broad horizontal sine contours replace vertical simplex-noise lines to suit the sea artwork and avoid another dependency. The source's touch interception and extra cursor dot are omitted. There are 17 paths on desktop and 10 on small screens, with at most 66 points per path. Existing SVG paths are reused during resize.
- Waves animate for 4.2 seconds on entering the viewport and settle after pointer activity. They stop offscreen, in hidden tabs, and with reduced motion. Graphics remain visible as static artwork when reduced motion is enabled.
- Spotlight retains the source's local pointer position, radial light, and focus/hover behavior. It uses a translated fixed-size gradient instead of React state and a repainted gradient position. Card colors and shapes remain Odyssey's. No cursor tracking runs on coarse pointers or with reduced motion.
- The added wave and light elements are hidden from assistive technology and cannot intercept clicks. Native links preserve their destinations.
- The existing GSAP hero selector excludes decorative elements so two animation systems do not compete over the waves.
- Generated heading wrappers now carry a class and preserve normal wrapping; this fixes the existing Chinese-accent nowrap rule unintentionally clipping the whole Joint-School heading on phones.

## Other catalog candidates evaluated

- [Wavy Background by manuarora700](https://21st.dev/@manuarora700/components/wavy-background): an alternative ocean treatment, but the retrieved fine-line wave component better matches the existing illustration and thin rules.
- [WaveBackground by ruixen.ui](https://21st.dev/@ruixen.ui/components/wave-background): WebGL alternative; unnecessary for the subtle line treatment selected here.
- [Border Beam by dillionverma](https://21st.dev/@dillionverma/components/border-beam): would compete with the existing moving journey line, especially around the hero and countdown.
- [Orbiting Circles by dillionverma](https://21st.dev/@dillionverma/components/orbiting-circles): possible logo-section alternative; orbiting icons have less connection to this association's nautical identity than waves.
- [Scroll 01 by felipemenezes098](https://21st.dev/@felipemenezes098/components/scroll-01): sticky imagery beside event text could be useful when real event photos are available. No event photography was fabricated.

These alternatives were evaluated from catalog metadata, not retrieved source. The account's two free daily component retrievals were used for Wave Background and Spotlight Card; no paid plan or additional retrieval was purchased.

## Files

- `assets/css/odyssey-elements.css`: component styling, responsive variants, reduced motion, and forced colors.
- `assets/js/odyssey-elements.js`: component adaptations and event month accents.
- All five HTML pages load the shared additions. The homepage contains the explicit wave placements and policy numbering.

## Verification

- Local browser review at 1280 × 720 and 390 × 844; the long Joint-School heading was also measured at 320 × 740, with its scroll width equal to its available width.
- All five pages checked at 390px with document width no greater than viewport width. Wave SVGs initialized on every page; no browser warning or error was captured during these checks.
- Mobile menu opened, Escape dismissed it, and the homepage Services link navigated to the Services page.
- Keyboard Tab moved between document links with a visible focus outline. The homepage wave path changed after arrival, confirming animation execution.
- JavaScript syntax checks and `git diff --check` passed. Reduced-motion and offscreen guards were inspected in source; OS-level reduced-motion emulation was not exercised in this browser session.
