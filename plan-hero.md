# Odyssey Hero Experiment Plan

Status: plan only. This document is the handoff for another coding agent. The implementation must happen in a separate, disposable Git worktree.

## Goal

Improve the homepage hero for Cabinet Odyssey 2026-2027 so the first screen feels like a short visual journey into the campaign message. Preserve the existing Odyssey artwork, palette, typography, bilingual content, voting countdown, and real election-platform link.

Primary user outcome: read the Election Platform.

Chosen direction: a short desktop scroll-led reveal called **Voyage Reveal**. The existing banner poster moves out of the way as the live campaign message enters. This should feel intentional and editorial, not like a generic collection of fade-up animations.

## Repository facts

- Repository: `/Users/judeliu/Documents/A/SA_Website`
- Stack: static HTML, plain CSS, dependency-free JavaScript, Google Fonts.
- Main files: `/Users/judeliu/Documents/A/SA_Website/index.html`, `/Users/judeliu/Documents/A/SA_Website/assets/css/odyssey-ui.css`, `/Users/judeliu/Documents/A/SA_Website/assets/js/odyssey-ui.js`.
- Current assets include `assets/banner.jpg`, `assets/banner-optimized.jpg`, `assets/banner-mobile.jpg`, `assets/logo-badge.jpg`, and `assets/logo.png`.
- The current checkout contains uncommitted homepage/shared-UI changes and untracked CSS, JS, and optimized assets. Do not assume clean `main` represents the current page.
- The current hero is rendered as a wide artwork banner followed by a dark content card. The artwork already contains a large ODYSSEY wordmark, while the live card repeats ODYSSEY.
- Current motion already includes a hero image entrance, content entrance, IntersectionObserver reveals, timeline motion, menu transitions, and reduced-motion handling. Replace or simplify overlapping hero motion rather than stacking more effects.
- Current desktop hero hooks begin around `index.html:610`, shared hero CSS begins around `assets/css/odyssey-ui.css:312`, and shared reveal JavaScript begins around `assets/js/odyssey-ui.js:87`.

## Design read

Student election landing page for current and prospective voters, using a nostalgic maritime campaign-poster language.

- ENERGY: 2, balanced
- RHYTHM: 2, consistent with a few breaks
- MOTION: 3, short scroll choreography with restraint

Identity decisions and reasons:

- Preserve the teal, orange, cream, Cormorant Garamond, DM Sans, Noto Serif TC, logo, and banner because they already form a distinctive campaign identity.
- Remove the feeling of a second poster card because the current banner and card duplicate the same wordmark and compete for attention.
- Use a short sticky scroll stage because “Odyssey” is a journey concept and the motion can explain that idea without taking control of the user’s scroll.
- Keep the real platform CTA and voting countdown because the hero’s job is campaign action, not decoration.
- Keep the existing static artwork as the source of truth. Do not use generative video as the primary brand asset.

## Hero behavior

Use a `160svh` desktop wrapper with a `100svh` sticky stage. Do not hijack the wheel, add snap points, or lock page scrolling.

1. At 0 to 35% progress, show the complete banner at its natural 3:1 composition. Use one restrained 700ms image-settle entrance.
2. At 35 to 70%, move the artwork upward and scale it from `1` to `1.06`. Fade in a solid teal overlay using opacity. The artwork should remain recognizable while the live message becomes the focus.
3. At 50 to 85%, reveal the campaign content as one grouped unit from `translateY(48px)` and `opacity: 0` to its settled position and full opacity. The group contains the semantic `h1`, bilingual cabinet identity, real CTA, and countdown.
4. At 85 to 100%, hold the campaign message long enough to read. The embedded artwork wordmark should be mostly out of view so “ODYSSEY” is not visibly duplicated.
5. When the wrapper ends, release naturally into the existing “The Meaning of Odyssey” section.

On screens below `901px`, disable sticky choreography. Show the complete mobile banner without horizontal cropping, then the compact campaign content. Keep only a gentle grouped entrance. The hero must work at 320px width and 390x844 without overflow.

## Motion implementation

Use existing easing tokens:

- `--odyssey-ease-out: cubic-bezier(.23, 1, .32, 1)`
- `--odyssey-ease-in-out: cubic-bezier(.77, 0, .175, 1)`

Add `initHeroScroll()` to `assets/js/odyssey-ui.js`.

- Enable choreography only at `min-width: 901px` and when `prefers-reduced-motion: reduce` is not active.
- Use one passive scroll listener and `requestAnimationFrame` to calculate normalized progress.
- Use paused Web Animations API sequences or equivalent transform/opacity updates for two groups: artwork and campaign content.
- Recalculate geometry on resize and orientation changes.
- Add a static fallback when JavaScript or animation support is unavailable.
- Do not use looping motion, mouse tracking, background video, scroll snapping, or full-page scroll hijacking.
- Keep all transform and opacity work on composited layers. Avoid per-frame layout writes.

Suggested artwork keyframes:

```text
0%:   opacity 1,    transform translate3d(0, 0, 0) scale(1)
55%:  opacity 1,    transform translate3d(0, -4vh, 0) scale(1.025)
100%: opacity .12,  transform translate3d(0, -34vh, 0) scale(1.06)
```

Suggested grouped-content keyframes:

```text
0%:   opacity 0, transform translate3d(0, 48px, 0)
35%:  opacity 0, transform translate3d(0, 48px, 0)
75%:  opacity 1, transform translate3d(0, 0, 0)
100%: opacity 1, transform translate3d(0, 0, 0)
```

The exact CSS/DOM structure may be chosen by the implementer, but use explicit hooks such as `[data-hero-scroll]`, `[data-hero-art]`, and `[data-hero-content]` so the behavior is understandable.

## Markup and styling changes

- Restructure only the homepage hero in `index.html` into a scroll wrapper and sticky stage.
- Retain the existing `<picture>` element, optimized desktop image, mobile image, logo badge, bilingual copy, countdown, and platform URL.
- Keep a semantic visible `h1`, but reveal it after the embedded poster wordmark has mostly moved away to avoid duplication.
- Replace the opaque desktop content card with a full-stage teal/night composition and a clear text/countdown hierarchy.
- Keep the navigation, skip link, focus ring, mobile menu, and existing section anchors working.
- On mobile, prefer the full banner aspect ratio over forcing a tall cropped image. Preserve readable artwork before adding motion.
- Do not introduce a generic gradient, glow field, grid, glassmorphism stack, bento section, fake terminal, decorative status dot, or invented statistic.
- Keep all CTA labels specific. The main CTA remains `Read the Election Platform`.

## Higgsfield decision

Higgsfield Basic is enough for a small optional visual experiment, but it is not required for v1. Higgsfield currently describes Basic as an image-exploration plan with a limited credit balance, and every MCP generation and reroll consumes credits. See:

- https://higgsfield.ai/blog/ai-video-credits-explained
- https://higgsfield.ai/creator-hub/help-center/credits/how-credits-work

If an optional Phase 2 asset is explored, generate only one short, text-free ambient ocean/light texture, ideally 6 to 8 seconds, and use it as a desktop-only enhancement with the static banner as the fallback. Do not ask generative video to recreate the logo, banner lettering, or campaign information. Generated text and logos can drift, which conflicts with the preserve-exactly decision.

## Validation plan

- Desktop at 1280x720 and 1440x900: verify the poster, handoff, readable hold, and clean release into the mission section.
- Mobile at 390x844 and 320px width: verify full artwork visibility, no sticky behavior, no horizontal overflow, and 44px minimum touch targets.
- Reduced motion: remove scroll transforms and use a 200ms opacity-only reveal while making all content immediately available.
- Keyboard: verify skip link, CTA focus, navigation links, mobile menu, Escape behavior, and visible focus indicators.
- Deep links: verify `#mission`, `#events`, `#members`, and `#docs` still land correctly with the fixed nav.
- Resilience: verify JavaScript-disabled fallback, image fallback, orientation changes, restored scroll position, and the countdown before and after voting day.
- Performance: verify no console errors, no autoplay video in v1, no layout thrashing, and preserved high-priority banner loading.
- Run the static site and record a click-through for every interactive hero and navigation element before merging anything.

## Worktree procedure

The experiment must not be implemented on the current checkout or merged automatically.

Preferred setup: create a sibling worktree named `SA_Website-hero-scroll` on branch `codex/odyssey-hero-scroll` from the **current workspace snapshot**, including the current uncommitted homepage/shared-UI work.

If the agent cannot create a worktree from a working-tree snapshot, create the branch from `main` and copy/apply the current versions of these required files into the isolated worktree before editing:

- `index.html`
- `assets/css/odyssey-ui.css`
- `assets/js/odyssey-ui.js`
- `assets/banner-optimized.jpg`
- `assets/banner-mobile.jpg`
- `assets/logo-badge.jpg`

Keep all hero changes on the isolated branch. Do not reset, clean, or overwrite the original checkout. When the user dislikes the experiment, they should be able to remove the worktree and branch without affecting `main`.

## Copy-paste prompt for GLM 5.3 Flash Vision

```text
You are implementing a disposable hero experiment for the static website at /Users/judeliu/Documents/A/SA_Website.

First create and work only in a separate sibling Git worktree:
- Branch: codex/odyssey-hero-scroll
- Worktree: /Users/judeliu/Documents/A/SA_Website-hero-scroll
- Do not modify the original checkout.
- The original checkout currently has uncommitted homepage/shared-UI edits and untracked assets/css/js. Prefer creating the worktree from the current workspace snapshot. If your tooling cannot snapshot uncommitted work, create from main and then copy/apply the current versions of index.html, assets/css/odyssey-ui.css, assets/js/odyssey-ui.js, assets/banner-optimized.jpg, assets/banner-mobile.jpg, and assets/logo-badge.jpg before editing.

Read /Users/judeliu/Documents/A/plan-hero.md completely before changing code. It is the source of truth for this task.

Implement the “Voyage Reveal” homepage hero only:
- Preserve the existing Odyssey banner, logo, teal/orange/cream palette, Cormorant Garamond, DM Sans, Noto Serif TC, bilingual copy, countdown, and real Google Docs platform link.
- Preserve the artwork exactly. Do not generate a replacement logo or banner.
- On desktop, use a short 160svh wrapper with a 100svh sticky stage. Do not hijack scrolling, snap scrolling, or lock the wheel.
- At the start, show the full banner at its natural 3:1 composition.
- As the user scrolls, move the artwork upward and scale it from 1 to 1.06 while fading a teal overlay in. Then reveal the live campaign content as one grouped unit from translateY(48px) and opacity 0.
- Hold the campaign message long enough to read and avoid showing the embedded ODYSSEY wordmark and live ODYSSEY heading as competing duplicates at the same time.
- Release naturally into the existing “The Meaning of Odyssey” section.
- On screens below 901px, disable sticky choreography, show the complete mobile banner without horizontal cropping, and keep a compact static content layout.
- Keep the primary CTA text specific: “Read the Election Platform”.
- Use the existing easing tokens --odyssey-ease-out and --odyssey-ease-in-out.
- Add initHeroScroll() to assets/js/odyssey-ui.js using one passive scroll listener plus requestAnimationFrame, or paused Web Animations API sequences. Animate transform and opacity only. Add a static fallback.
- Respect prefers-reduced-motion with an opacity-only 200ms reveal and no scroll choreography.
- Do not add a motion library, autoplay video, looping effects, mouse tracking, scroll snapping, fake terminal, bento layout, generic gradient, glow field, grid, decorative status dot, or invented claim/statistic.
- Keep keyboard access, visible focus styles, skip link, mobile menu, deep links, countdown behavior, image fallback, and existing navigation intact.

Before editing, inspect the existing hero and shared CSS/JS. Avoid touching unrelated pages. Do not use scripts that rewrite source files. Use normal source edits and keep the worktree disposable.

Test at 1280x720, 1440x900, 390x844, and 320px width. Verify desktop scroll phases, mobile fallback, reduced motion, JavaScript-disabled fallback, keyboard navigation, deep links, orientation changes, countdown before/after voting day, no horizontal overflow, no console errors, and no layout thrashing. Run the static site and record the click-through results.

Do not use Higgsfield for v1. If a later optional experiment is requested, use it only for one text-free 6 to 8 second ocean/light texture and keep the static banner fallback. Higgsfield MCP generations consume credits, so state the estimated cost before generating anything.

At the end, report:
1. Files changed in the isolated worktree.
2. How to preview the worktree.
3. Test results and any limitations.
4. The exact command to delete only this worktree and branch if the experiment is rejected.
```

