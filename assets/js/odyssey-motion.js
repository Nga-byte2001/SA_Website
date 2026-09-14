/* Odyssey motion engine.
   Scroll-driven story mechanics in the style of meuze.ai: inertial wheel
   scrolling, a scroll-scrubbed hero
   transformation, a pinned two-beat mission stage whose frame the dot
   traces, a continuous zig-zag route line that runs the whole page
   (horizontal runs inside sections, drops between them) with graphics that
   light up as the dot passes, a pinned five-board cabinet stage whose
   sheets sweep over one another (content rotating in around the
   bottom-left corner, the FlowArt/story-scroll reveal), and background
   colour that shifts between sections. Fine pointers get the wheel engine;
   touch keeps native scrolling plus every scrub. Reduced motion disables
   all of it. The engine never scrolls the page on its own — when input
   stops, the page stays exactly where the user left it. */
(function () {
  'use strict';

  var body = document.body;
  if (!body.classList.contains('home-page')) return;

  var docEl = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var engineOn = finePointer && !reduceMotion;

  docEl.classList.add('motion-observed');
  if (reduceMotion) docEl.classList.add('motion-still');
  if (engineOn) docEl.classList.add('engine-scroll');

  /* ---------- tracked sections ---------- */

  var SECTIONS = [
    { id: 'top', selector: '.hero', label: 'Opening', nav: null },
    { id: 'countdown', selector: '.hero', label: 'Countdown', nav: null },
    { id: 'mission', selector: '#mission', label: 'Mission', nav: '#mission' },
    { id: 'events', selector: '#events', label: 'Events', nav: '#events' },
    { id: 'members', selector: '#members', label: 'Cabinet', nav: '#members' },
    { id: 'docs', selector: '#docs', label: 'Documents', nav: '#docs' },
    { id: 'page-end', selector: 'footer', label: 'Contact', nav: null }
  ];

  /* Inserted only while the hero scrub is on: the resting point where the
     card owns the pinned stage. Its scroll top is the scrub distance, not
     an element offset, so measure() special-cases it. */
  var COUNTDOWN_SECTION = { id: 'countdown', selector: '.hero', label: 'Countdown', nav: null };

  /* ---------- state ---------- */

  var vh = window.innerHeight;
  var vw = window.innerWidth;
  var maxScroll = 1;
  var tops = [];         // document-space top of each section
  var current = window.scrollY;   // smoothed position
  var target = window.scrollY;    // where the wheel wants to go
  var tween = null;      // {from, to, start, duration} — anchor glides only
  var activeIndex = -1;
  var navLinks = [];
  var heroBg = null;
  var heroContent = null;
  var heroStage = null;
  var countdownEl = null;

  /* Hero scrub geometry (html.hero-scrub), all in stage-local pixels. */
  var scrubOn = false;
  var scrubDist = 1;     // scroll distance the hero transformation plays over
  var stageVh = 1;       // pinned stage height (100svh)
  var stageW = 1;        // pinned stage width
  var cardTop0 = 0;      // card top at load (banner height minus overlap)
  var cardW0 = 1;        // card width at load
  var cardH0 = 1;        // card natural height at load
  var cntH0 = 1;         // countdown natural height (it starts collapsed)
  var cntMargin = 0;     // countdown natural top margin
  var lastScrubT = -1;   // last painted scrub progress; -1 forces a repaint
  var lastFrameTime = 0;

  /* Mission scrub state (html.mission-scrub): a pinned two-beat stage —
     "The Meaning of Odyssey" then "What We Do" — whose frame boxes the
     route dot traces while the beats crossfade. */
  var missionOn = false;
  var mWrap = null;
  var mStage = null;
  var mBeatEls = [];
  var mFrames = [];      // beat-frame rects relative to the stage
  var mStart = 0;        // scrollY where the stage pins
  var mDist = 1;         // scroll distance the stage plays over
  var mStageH = 1;
  var mLastT = -1;
  var mStageSeen = false;  // IO: the pinned stage is on screen
  var mStageIO = null;

  /* Cabinet flow state (html.cabinet-flow): five full-viewport boards that
     pin at the viewport top while the next board sweeps over; each incoming
     board's content rotates 30deg -> 0 around its bottom-left corner,
     scrubbed by scroll. Pinning is CSS (sticky); only the rotation is
     painted here. */
  var cabFlowOn = false;
  var cabStack = null;
  var cabPanelEls = [];
  var cabInnerEls = [];
  var cabTops = [];      // document-space top of each board
  var lastCabScroll = -1;

  /* Page route state (html.route-on): the zig-zag line + travelling dot. */
  var routeOn = false;
  var colorOn = false;
  var routeSvg = null;
  var routeBase = null;
  var routeLit = null;
  var routeDotEl = null;
  var xSpine = 24;       // vertical runs: the margin rail left of the column
  var xRight = 24;       // right-side runs: content right edge
  var cabRows = [];      // [{el, y}] cabinet rows that light up
  var showMid = 0;       // logo-showcase middle, keys the colour bands
  var showStartY = 0;    // cabinet→logo diagonal start: above the section border
  var showEndY = 0;      // cabinet→logo diagonal end: below the section border
  var docsMid = 0;       // docs horizontal run height (doc space)
  var footerTop = 0;
  var routeEndY = 0;     // terminal point in the footer
  var footerTopDoc = 0;
  var dotX = -100;
  var dotY = -100;
  var routeBuiltD = '';
  var routeLitD = '';
  var routeAppear = -1;
  var routePaintedScroll = -1;
  var routeDirty = true; // re-measure changed geometry: force the next paint
  var dotPainted = '';   // last transform string written to the dot
  var routeOnCopper = false; // dot is inside the copper board (flow panel 01)

  var LERP = 0.1;              // approach factor per frame (meuze uses 0.12)
  var SCRUB_MIN_VIEWPORT = 520; // px: below this the static stacked layout stays
  var SCRUB_MIN_BANNER = 170;   // px: shortest banner worth showing at load
  var ROUTE_MIN_VIEWPORT = 900; // px: the route line needs the room
  var FLOW_MIN_VIEWPORT = 900;  // px: the cabinet flow stage needs the same room
  var FLOW_MIN_HEIGHT = 560;    // px: below this a 100svh board cannot hold its members

  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  // smoothstep, the same easing family meuze scrubs with
  var smooth = function (t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  /* Document-space top from layout boxes. Sticky pinning and scrub
     transforms displace getBoundingClientRect, so anything measured inside
     the cabinet flow stage must read layout, never live rects. */
  function docTop(el) {
    var y = 0;
    while (el) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  }

  /* ---------- geometry ---------- */

  function sectionIndex(id) {
    for (var i = 0; i < SECTIONS.length; i++) {
      if (SECTIONS[i].id === id) return i;
    }
    return -1;
  }

  /* Turns the hero scrub on or off. Off means: no html.hero-scrub class, so
     the static stacked layout applies and the timer is visible from load —
     the fallback for reduced motion and viewports where the grown card
     cannot fit (measure() re-checks that once the scrub layout is live). */
  function setupScrub(forceOff) {
    var on = !forceOff &&
             !reduceMotion &&
             window.innerHeight > SCRUB_MIN_VIEWPORT &&
             !!heroStage && !!heroContent && !!heroBg;
    if (on === scrubOn) return;
    scrubOn = on;
    docEl.classList.toggle('hero-scrub', on);

    var idx = sectionIndex('countdown');
    if (on && idx === -1) SECTIONS.splice(1, 0, COUNTDOWN_SECTION);
    if (!on && idx > -1) SECTIONS.splice(idx, 1);

    if (!on) {
      // Drop every inline scrub style so the static layout is pristine.
      if (heroStage) {
        heroStage.style.removeProperty('--hero-banner-h');
        heroStage.style.removeProperty('--hero-glass');
      }
      if (heroBg) { heroBg.style.opacity = ''; heroBg.style.transform = ''; }
      if (heroContent) {
        heroContent.style.top = '';
        heroContent.style.height = '';
        heroContent.style.width = '';
      }
      if (countdownEl) {
        countdownEl.style.height = '';
        countdownEl.style.marginTop = '';
        countdownEl.style.opacity = '';
        countdownEl.style.transform = '';
      }
      lastScrubT = -1;
    }
  }

  /* Turns the mission scrub (pinned two-beat stage) on or off. */
  function setupMissionScrub(forceOff) {
    var on = !forceOff &&
             !reduceMotion &&
             window.innerWidth >= ROUTE_MIN_VIEWPORT &&
             !!mStage && mBeatEls.length === 2;
    if (on === missionOn) return;
    missionOn = on;
    docEl.classList.toggle('mission-scrub', on);

    mBeatEls.forEach(function (beat) {
      if (on) splitBeatLines(beat);
      else unsplitBeatLines(beat);
      beat.style.opacity = '';
      beat.style.transform = '';
      beat.classList.remove('is-live');
      beat.classList.remove('lines-in');
      beat.inert = false;
    });
    mLastT = -1;
  }

  /* Turns the cabinet flow stage on or off. Off means: no html.cabinet-flow
     class, so the boards stack statically in normal flow — the fallback for
     reduced motion and viewports where a 100svh board cannot hold its
     members. */
  function setupCabinetFlow(forceOff) {
    if (!cabStack) cabStack = document.querySelector('[data-cabinet-flow]');
    if (cabStack && !cabPanelEls.length) {
      cabPanelEls = Array.prototype.slice.call(cabStack.querySelectorAll('.flow-panel'));
      cabInnerEls = cabPanelEls.map(function (panel) {
        return panel.querySelector('.flow-panel-inner');
      });
    }
    var on = !forceOff &&
             !reduceMotion &&
             !!cabStack &&
             cabPanelEls.length > 1 &&
             window.innerWidth >= FLOW_MIN_VIEWPORT &&
             window.innerHeight >= FLOW_MIN_HEIGHT;
    if (on === cabFlowOn) return;
    cabFlowOn = on;
    docEl.classList.toggle('cabinet-flow', on);
    if (!on) {
      cabInnerEls.forEach(function (inner) {
        if (inner) inner.style.transform = '';
      });
      lastCabScroll = -1;
    }
  }

  /* ---------- line-mask reveal (the "Lines" transition) ---------- */

  /* Split an element into rendered lines, each wrapped in an overflow mask
     with a rising inner span. Latin text splits per word; CJK runs split per
     character so natural wrapping survives the inline-block tokens. */
  function splitBeatLines(beat) {
    var targets = beat.querySelectorAll('.section-title, .content-block p');
    var lineIndex = 0;

    Array.prototype.forEach.call(targets, function (el) {
      if (el.dataset.lineSplit) { unsplitBeatLines(el); }
      el.dataset.lineOriginal = el.innerHTML;
      el.classList.add('line-split');

      // Tokenize: element children (em) stay one token; Latin runs become
      // word tokens; CJK runs become per-character tokens.
      var frag = document.createDocumentFragment();
      Array.prototype.slice.call(el.childNodes).forEach(function (node) {
        if (node.nodeType === 3) {
          node.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(' '));
            } else if (/[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(part)) {
              Array.prototype.forEach.call(part, function (ch) {
                var sp = document.createElement('span');
                sp.className = 'tok';
                sp.textContent = ch;
                frag.appendChild(sp);
              });
            } else {
              var sp = document.createElement('span');
              sp.className = 'tok';
              sp.textContent = part;
              frag.appendChild(sp);
            }
          });
        } else {
          var sp = document.createElement('span');
          sp.className = 'tok';
          sp.appendChild(node.cloneNode(true));
          frag.appendChild(sp);
        }
      });
      el.innerHTML = '';
      el.appendChild(frag);

      // Group tokens into rendered lines by their vertical position.
      var lines = [];
      var current = null;
      var currentTop = null;
      Array.prototype.forEach.call(el.childNodes, function (node) {
        var top = null;
        if (node.nodeType === 1) {
          top = node.offsetTop;
          if (currentTop === null || Math.abs(top - currentTop) > 4) {
            current = [];
            lines.push(current);
            currentTop = top;
          }
        }
        if (!current) { current = []; lines.push(current); currentTop = top || 0; }
        current.push(node);
      });

      // Rebuild as masked lines (whitespace trimmed at line edges).
      el.innerHTML = '';
      lines.forEach(function (nodes) {
        while (nodes.length && nodes[0].nodeType === 3 && !nodes[0].textContent.trim()) nodes.shift();
        while (nodes.length && nodes[nodes.length - 1].nodeType === 3 && !nodes[nodes.length - 1].textContent.trim()) nodes.pop();
        if (!nodes.length) return;
        var mask = document.createElement('span');
        mask.className = 'line-mask';
        var inner = document.createElement('span');
        inner.className = 'line-inner';
        inner.style.setProperty('--li', String(lineIndex++));
        nodes.forEach(function (n) { inner.appendChild(n); });
        mask.appendChild(inner);
        el.appendChild(mask);
      });
    });
  }

  function unsplitBeatLines(beat) {
    beat.querySelectorAll('.line-split').forEach(function (el) {
      if (el.dataset.lineOriginal !== undefined) el.innerHTML = el.dataset.lineOriginal;
      el.classList.remove('line-split');
    });
    beat.classList.remove('lines-in');
  }

  /* Turns the route line + dot and the colour scrub on or off. */
  function setupRoute(forceOff) {
    var on = !forceOff && !reduceMotion && window.innerWidth >= ROUTE_MIN_VIEWPORT;
    if (on === routeOn && on === colorOn) return;
    routeOn = on;
    colorOn = on;
    docEl.classList.toggle('route-on', on);
    docEl.classList.toggle('color-scrub', on);
    if (!on) {
      if (routeSvg) routeSvg.style.opacity = '0';
      cabRows.forEach(function (item) { item.el.classList.remove('is-lit'); });
      dotX = dotY = -100;
    }
  }

  function measure() {
    vh = window.innerHeight;
    vw = window.innerWidth;

    if (scrubOn && heroStage && heroContent) {
      // Read the natural load-state geometry with scrub styles cleared; the
      // next frame repaints them (lastScrubT reset below forces the repaint).
      heroContent.style.top = '';
      heroContent.style.height = '';
      heroContent.style.width = '';
      if (countdownEl) {
        countdownEl.style.height = '';
        countdownEl.style.marginTop = '';
        countdownEl.style.opacity = '';
        countdownEl.style.transform = '';
      }
      heroStage.style.removeProperty('--hero-banner-h');
      heroStage.style.removeProperty('--hero-glass');
      stageVh = heroStage.clientHeight;
      stageW = heroStage.clientWidth;
      scrubDist = stageVh;
      var bannerH0 = heroBg.offsetHeight;
      cardTop0 = heroContent.offsetTop;
      cardW0 = heroContent.offsetWidth;
      if (countdownEl) {
        cntMargin = parseFloat(getComputedStyle(countdownEl).marginTop) || 0;
        // Collapse the timer before measuring the card: the load-state card
        // is the card WITHOUT the still-hidden countdown's dead space.
        countdownEl.style.marginTop = '0px';
        countdownEl.style.height = '0px';
      }
      cardH0 = heroContent.offsetHeight;
      if (countdownEl) {
        countdownEl.style.height = '';
        cntH0 = countdownEl.offsetHeight;
      }
      // The whole load composition — banner, card, and the card's bottom
      // edge — must sit inside the pinned stage, or the card reads as cut
      // off by the fold. Shrink the banner first, keeping its designed
      // overlap with the card, then lift the card as a last resort.
      var overlap = bannerH0 - cardTop0;
      var gap = clamp(stageVh * 0.024, 12, 28);
      var bannerMax = stageVh - cardH0 - gap + overlap;
      if (bannerH0 > bannerMax) {
        var bannerH = Math.max(SCRUB_MIN_BANNER, bannerMax);
        heroStage.style.setProperty('--hero-banner-h', bannerH.toFixed(1) + 'px');
        cardTop0 = Math.max(0, Math.min(bannerH - overlap, stageVh - cardH0 - gap));
      }
      lastScrubT = -1;
      if (cardH0 + cntMargin + cntH0 > stageVh) {
        // Even compact, the card plus the grown countdown cannot fit the
        // viewport, so the scrub would clip its own timer. Fall back to the
        // static layout instead.
        setupScrub(true);
      }
    }

    if (missionOn && mStage) {
      mStageH = mStage.clientHeight;
      mStart = mWrap.offsetTop;
      mDist = Math.max(1, mWrap.offsetHeight - mStageH);
      // Layout offsets, not getBoundingClientRect: the beats carry scrub
      // transforms (translateY mid-crossfade) that would contaminate a
      // measured rect and double-draw the frame boxes.
      mFrames = mBeatEls.map(function (beat) {
        var f = beat.querySelector('.beat-frame');
        if (!f) return { x: 0, y: 0, r: 0, b: 0 };
        var x = f.offsetLeft + beat.offsetLeft;
        var y = f.offsetTop + beat.offsetTop;
        return { x: x, y: y, r: x + f.offsetWidth, b: y + f.offsetHeight };
      });
      mLastT = -1;
      if (mFrames.some(function (frame) { return frame.b > mStageH - 12; })) {
        setupMissionScrub(true);
      }
    }

    if (cabFlowOn && cabInnerEls.some(function (inner) {
      if (!inner) return false;
      var style = getComputedStyle(inner);
      var needed = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      Array.prototype.forEach.call(inner.children, function (child) {
        var childStyle = getComputedStyle(child);
        needed += child.offsetHeight + (parseFloat(childStyle.marginTop) || 0) + (parseFloat(childStyle.marginBottom) || 0);
      });
      return needed > inner.clientHeight + 1;
    })) {
      setupCabinetFlow(true);
    }

    if (cabPanelEls.length > 1) {
      // Layout tops: sticky displacement never touches offsetTop, so these
      // stay honest at any scroll position. Read whenever the boards exist —
      // the route's copper-board recolor uses them, flow stage on or off.
      cabTops = cabPanelEls.map(function (panel) { return docTop(panel); });
    }

    if (cabFlowOn && cabPanelEls.length > 1) {
      lastCabScroll = -1;
    }

    // Restore the measured hero before the browser applies scroll anchoring.
    // Leaving its temporary natural layout until the next frame shifts deep links.
    if (scrubOn) paintHero(window.scrollY);
    var docH = docEl.scrollHeight;
    maxScroll = Math.max(1, docH - vh);
    tops = SECTIONS.map(function (s) {
      if (scrubOn && s.id === 'countdown') return scrubDist;
      var el = document.querySelector(s.selector);
      return el ? el.offsetTop : 0;
    });

    measureRoute();
  }

  /* Route geometry, all document-space. */
  function measureRoute() {
    if (!routeOn) return;

    var eventsEl = document.querySelector('#events');
    if (eventsEl) {
      // X is scroll-invariant: the route SVG is fixed to the viewport, so
      // the rail keys off the container's viewport left edge. Adding scrollY
      // here would fling the whole route off-screen the first time a
      // re-measure fires mid-scroll (resize, fonts, late GSAP settle).
      var er = eventsEl.getBoundingClientRect();
      cLeftSet(er.left, er.width);
    } else {
      cLeftSet(24, Math.min(vw - 48, 1120));
    }

    cabRows = Array.prototype.map.call(
      document.querySelectorAll('.cabinet-row'),
      function (el) {
        // Layout space: the boards carry sticky pinning and scrub rotation,
        // both of which contaminate getBoundingClientRect.
        return { el: el, y: docTop(el) + 64 };
      });

    var show = document.querySelector('.logo-showcase');
    if (show) {
      var sr2 = show.getBoundingClientRect();
      var showTop = sr2.top + window.scrollY;
      showMid = showTop + sr2.height * 0.5;

      // The cabinet→logo diagonal lives in the air between the two
      // sections: centred on their border, rising at most a sixth of the
      // viewport on each side but never into the last portrait row or the
      // badge. The last row is measured in layout space (it lives inside
      // the pinned boards); the 56px floor keeps the diagonal out of
      // trouble.
      var rise = vh / 6;
      var lastRow = document.querySelector('.cabinet-row:last-of-type');
      if (lastRow) {
        rise = Math.min(rise, Math.max(56,
          showTop - (docTop(lastRow) + lastRow.offsetHeight) - 28));
      }
      var badge = show.querySelector('img');
      if (badge) {
        rise = Math.min(rise, Math.max(56,
          badge.getBoundingClientRect().top + window.scrollY - showTop - 28));
      }
      showStartY = showTop - rise;
      showEndY = showTop + rise;
    }
    var grid = document.querySelector('.doc-links');
    if (grid) {
      var gr = grid.getBoundingClientRect();
      docsMid = gr.top + window.scrollY - 44; // just above the grid, below the title
    }
    var footer = document.querySelector('footer');
    if (footer) {
      var fr = footer.getBoundingClientRect();
      footerTopDoc = fr.top + window.scrollY;
      footerTop = footerTopDoc + 56;
      // The journey ends where the footer's hairline rule sits: the dot
      // comes to rest straddling it when the page is scrolled out.
      var end = footer.querySelector('.footer-bottom');
      routeEndY = end
        ? end.getBoundingClientRect().top + window.scrollY
        : footerTopDoc + fr.height - 60;
    }

    if (missionOn && mStage) {
      mStart = mWrap.offsetTop;
      mDist = Math.max(1, mWrap.offsetHeight - mStageH);
    }

    // Route svg paints in viewport pixels.
    if (routeSvg) routeSvg.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);

    // Teleport the dot to the current position (no cross-page lerp).
    var pt = routePointAt(window.scrollY);
    if (pt && isFinite(pt.x) && isFinite(pt.y)) { dotX = pt.x; dotY = pt.y; }
    routeDirty = true;
  }

  function cLeftSet(left, width) {
    // The rail lives in the margin, 20px clear of the content column's left
    // edge (clamped so the dot stays on-screen down at the 900px route
    // gate): every heading, board number, card border, and footer line then
    // keeps the same clearance — the line never crosses text.
    xSpine = Math.max(5, left - 20);
    xRight = left + width - 3.5;
  }

  /* ---------- page route ---------- */

  /* Builds the route polyline for this frame in viewport coordinates plus a
     parallel array of the scroll positions at which the dot reaches each
     vertex. Document-space vertices use the "passes at 55% viewport height"
     rule; vertices inside the pinned mission stage use stage progress. */
  function buildRoute(scrollY) {
    var V = [];
    var A = [];
    var lastA = -1;

    function pushStage(x, yVp, ta) {
      var a = clamp(mStart + ta * mDist, lastA + 0.01, maxScroll);
      lastA = a;
      V.push([x, yVp]);
      A.push(a);
    }

    function pushDoc(x, yDoc) {
      // Arrivals stay unclamped here; vertices whose scroll-in moment lies
      // beyond the page bottom are re-spread below so each keeps its own
      // moment in the final stretch of scroll.
      var a = Math.max(yDoc - vh * 0.55, lastA + 1);
      lastA = a;
      V.push([x, yDoc - scrollY]);
      A.push(a);
    }

    // One continuous circuit through the mission stage: the line grows down
    // from the section's top edge, wraps the content frame, and returns to
    // the spine on its way to events. There is exactly one frame — it
    // morphs between the two beats as the copy crossfades — so the dot is
    // never off the line and no line ever doubles up.
    var mEnd = mStart + mDist;
    if (missionOn && mFrames.length === 2) {
      var t = clamp((scrollY - mStart) / mDist, 0, 1);
      var stageTopDoc = clamp(scrollY, mStart, mEnd);
      var stTopVp = stageTopDoc - scrollY;
      var sw = smooth(clamp((t - 0.34) / 0.18, 0, 1));
      var f0 = mFrames[0];
      var f1 = mFrames[1];
      var fx = f0.x + (f1.x - f0.x) * sw;
      var fr = f0.r + (f1.r - f0.r) * sw;
      var fy = f0.y + (f1.y - f0.y) * sw;
      var fb = f0.b + (f1.b - f0.b) * sw;
      var midY = (fy + fb) / 2;

      pushStage(xSpine, stTopVp, 0);              // grows from the section top
      pushStage(xSpine, stTopVp + midY, 0.06);    // down to the frame's midline
      pushStage(fx, stTopVp + midY, 0.12);        // across to the frame edge
      pushStage(fx, stTopVp + fy, 0.20);          // up to the top-left corner
      pushStage(fr, stTopVp + fy, 0.30);          // around: top edge
      pushStage(fr, stTopVp + fb, 0.40);          // right edge
      pushStage(fx, stTopVp + fb, 0.50);          // bottom edge
      pushStage(fx, stTopVp + midY, 0.60);        // left edge — loop closed
      pushStage(xSpine, stTopVp + midY, 0.66);    // back to the spine
      pushStage(xSpine, stTopVp + mStageH, 0.78); // down toward events
    }

    // Spine below the stage: events, cabinet, the boundary diagonal down to
    // the showcase, docs, footer. The exit vertex shares the stage bottom,
    // so the handoff is a continuation, not a jump.
    pushDoc(xSpine, mStart + mWrap.offsetHeight + 8);
    pushDoc(xSpine, showStartY);
    pushDoc(xRight, showEndY);
    pushDoc(xRight, docsMid);
    pushDoc(xSpine, docsMid);
    pushDoc(xSpine, footerTop);
    pushDoc(xSpine, routeEndY);

    // Vertices whose scroll-in moment lies beyond the page bottom (the short
    // footer drop) would otherwise share one clamped arrival, collapse the
    // last segment's span and freeze the dot a vertex short of the rule.
    // Spread them across the remaining scroll instead: strictly increasing
    // arrivals, the terminal vertex reached exactly as the scroll bottoms out.
    var firstLate = -1;
    for (var ai = 0; ai < A.length; ai++) {
      if (A[ai] > maxScroll) { firstLate = ai; break; }
    }
    if (firstLate > -1) {
      var from = firstLate > 0 ? A[firstLate - 1] : 0;
      var tail = Math.max(1, maxScroll - from);
      var count = A.length - firstLate;
      for (var bi = firstLate; bi < A.length; bi++) {
        A[bi] = from + tail * ((bi - firstLate + 1) / count);
      }
    }

    return { V: V, A: A };
  }

  function routePointAt(scrollY) {
    var built = buildRoute(scrollY);
    var V = built.V;
    var A = built.A;
    var i = 0;
    while (i < A.length - 2 && A[i + 1] < scrollY) i++;
    var span = Math.max(1, A[i + 1] - A[i]);
    var u = clamp((scrollY - A[i]) / span, 0, 1);
    var x = V[i][0] + (V[i + 1][0] - V[i][0]) * u;
    var y = V[i][1] + (V[i + 1][1] - V[i][1]) * u;
    return { x: x, y: y, i: i, u: u, V: V, A: A };
  }

  function paintRoute(scrollY) {
    if (!routeOn || !routeSvg) return;

    // The route joins the story as the hero scrub hands over; it is not part
    // of the banner show.
    var appear = scrubOn ? clamp((scrollY - scrubDist * 0.55) / (vh * 0.3), 0, 1) : 1;

    // Idle frames cost nothing: the route is a pure function of scrollY
    // (plus re-measured geometry, which sets routeDirty), so an unchanged
    // scroll skips every read and write below.
    if (!routeDirty && scrollY === routePaintedScroll) return;
    if (appear !== routeAppear) {
      routeSvg.style.opacity = appear.toFixed(3);
      routeAppear = appear;
    }
    if (appear <= 0.01) {
      routePaintedScroll = scrollY;
      routeDirty = false;
      return;
    }

    var pt = routePointAt(scrollY);
    if (!isFinite(pt.x) || !isFinite(pt.y)) return;
    var V = pt.V;

    // The dot rides the tip of the lit trail exactly. Scroll itself is the
    // smoothed quantity (engine chase, anchor glides, native touch scroll),
    // so easing the dot on top of that only made it sag behind the trail's
    // end on fast glides.
    dotX = pt.x;
    dotY = pt.y;

    // One line, one trail: the dim path is the whole circuit, the lit path
    // is exactly the part the dot has travelled. Both rebuild from the same
    // vertices every change, so the lit line can never separate from the
    // route or from the dot, and the frame morph carries both together.
    // Writes are guarded: an unchanged attribute string is never re-set.
    var li = pt.i;
    var d = 'M' + V.map(function (v) { return v[0].toFixed(1) + ' ' + v[1].toFixed(1); }).join('L');
    if (d !== routeBuiltD) {
      routeBase.setAttribute('d', d);
      routeBuiltD = d;
    }

    var t2 = [];
    for (var k = 0; k <= li && k < V.length; k++) t2.push(V[k]);
    t2.push([pt.x, pt.y]);
    var ld = 'M' + t2.map(function (v) { return v[0].toFixed(1) + ' ' + v[1].toFixed(1); }).join('L');
    if (ld !== routeLitD) {
      routeLit.setAttribute('d', ld);
      routeLitD = ld;
    }

    var dt = 'translate(' + dotX.toFixed(1) + ' ' + dotY.toFixed(1) + ')';
    if (dt !== dotPainted) {
      routeDotEl.setAttribute('transform', dt);
      dotPainted = dt;
    }

    // Graphics light up as the dot passes them.
    var dotDocY = dotY + scrollY;
    cabRows.forEach(function (row) {
      row.el.classList.toggle('is-lit', dotDocY >= row.y);
    });

    // While the dot is inside the copper board its orange would vanish into
    // the background, so the lit trail and dot recolor to the board's ink
    // navy for the length of that board.
    var overCopper = cabTops.length > 1 && dotDocY >= cabTops[0] && dotDocY < cabTops[1];
    if (overCopper !== routeOnCopper) {
      routeOnCopper = overCopper;
      routeSvg.classList.toggle('route-on-copper', overCopper);
    }

    routePaintedScroll = scrollY;
    routeDirty = false;
  }

  /* ---------- colour shift between sections ---------- */

  var BAND_COLORS = [
    [22, 46, 62],    // hero: night
    [42, 74, 90],    // mission: teal
    [22, 46, 62],    // events: night
    [42, 74, 90],    // members: teal
    [22, 46, 62],    // showcase: night
    [42, 74, 90],    // docs: teal
    [13, 30, 42]     // footer: deep night
  ];

  function paintColors(scrollY) {
    if (!colorOn) return;
    // Sample at the viewport's centre band, not its top edge: the colour
    // must match what fills the screen, not what just left it.
    var probe = scrollY + vh * 0.5;
    // Band order follows the page: hero, mission, events, members,
    // showcase (inside members band), docs, footer.
    var bandTops = [
      tops[sectionIndex('top')],
      tops[sectionIndex('mission')],
      tops[sectionIndex('events')],
      tops[sectionIndex('members')],
      showMid - vh * 0.5,
      tops[sectionIndex('docs')],
      footerTopDoc
    ];
    var from = BAND_COLORS[0];
    var to = BAND_COLORS[0];
    var morph = 0;
    for (var i = 0; i < bandTops.length - 1; i++) {
      if (probe >= bandTops[i] && (probe < bandTops[i + 1] || i === bandTops.length - 2)) {
        from = BAND_COLORS[i];
        to = BAND_COLORS[i + 1];
        var span = Math.max(1, bandTops[i + 1] - bandTops[i]);
        var t = clamp((probe - bandTops[i]) / span, 0, 1);
        // Colour holds through the section, then shifts near the boundary.
        morph = smooth(clamp((t - 0.55) / 0.35, 0, 1));
        break;
      }
    }
    if (probe >= bandTops[bandTops.length - 1]) {
      from = to = BAND_COLORS[BAND_COLORS.length - 1];
    }
    var r = Math.round(from[0] + (to[0] - from[0]) * morph);
    var g = Math.round(from[1] + (to[1] - from[1]) * morph);
    var b = Math.round(from[2] + (to[2] - from[2]) * morph);
    body.style.backgroundColor = 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ---------- spotlight ---------- */

  function setActive(index) {
    if (index === activeIndex) return;
    activeIndex = index;
    var info = SECTIONS[index];

    navLinks.forEach(function (link) {
      var on = info.nav && link.getAttribute('href') === info.nav;
      link.classList.toggle('is-current', !!on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });

    var host = document.querySelector(info.selector);
    if (host && !host.classList.contains('has-entered')) {
      host.classList.add('has-entered');
    }
  }

  function sectionAt(scrollY) {
    var probe = scrollY + vh * 0.45;
    var index = 0;
    for (var i = 0; i < tops.length; i++) {
      if (probe >= tops[i]) index = i;
    }
    if (scrollY > maxScroll - vh * 0.35) index = SECTIONS.length - 1;
    return index;
  }

  /* ---------- tween ---------- */

  function startTween(to, duration) {
    tween = {
      from: target,
      to: clamp(to, 0, maxScroll),
      start: performance.now(),
      duration: duration
    };
  }

  function glideTo(y) {
    var distance = Math.abs(y - target);
    if (distance < 1) return;
    var duration = clamp(480 + distance * 0.24, 520, 1350);
    startTween(y, duration);
  }

  /* ---------- wheel ---------- */

  function onWheel(event) {
    if (!event.isTrusted || event.ctrlKey) return;
    if (body.classList.contains('menu-open')) return;
    var delta = event.deltaY;
    if (event.deltaMode === 1) delta *= 16;
    else if (event.deltaMode === 2) delta *= vh;

    event.preventDefault();
    if (tween) tween = null;
    target = clamp(target + delta, 0, maxScroll);
  }

  /* ---------- anchors ---------- */

  function bindAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        if (link.classList.contains('skip-link')) return;
        var hash = link.getAttribute('href');
        if (!hash || hash === '#') return;
        var section = SECTIONS.filter(function (s) { return '#' + s.id === hash; })[0];
        if (!section) return;
        event.preventDefault();
        var el = document.querySelector(section.selector);
        if (!el) return;
        measure();
        var y;
        if (section.id === 'page-end') {
          y = maxScroll;
        } else if (section.id === 'countdown') {
          // The resting point of the hero scrub, not an element edge.
          y = clamp(scrubDist, 0, maxScroll);
        } else {
          y = clamp(el.offsetTop, 0, maxScroll);
        }
        if (reduceMotion) {
          window.scrollTo(0, y);
        } else {
          glideTo(y);
        }
        if (history.pushState) history.pushState(null, '', hash);
      });
    });
  }

  /* ---------- frame loop ---------- */

  function frame(now) {
    var elapsed = lastFrameTime ? Math.min(64, now - lastFrameTime) : 1000 / 60;
    lastFrameTime = now;
    // Tweens (anchor glides) run on every device; the inertial chase is
    // fine-pointer only. Neither ever moves the page on its own: when input
    // stops, `current` decays onto the last requested position and stays.
    if (tween) {
      var t = clamp((now - tween.start) / tween.duration, 0, 1);
      var v = tween.from + (tween.to - tween.from) * smooth(t);
      // The tween owns the position outright. Chasing it with the lerp
      // instead would leave a mushy ~700ms tail after every landing.
      target = v;
      current = v;
      if (t >= 1) { target = tween.to; current = tween.to; tween = null; }
    } else if (engineOn) {
      current += (target - current) * (1 - Math.pow(1 - LERP, elapsed / (1000 / 60)));
      if (Math.abs(target - current) < 0.12) current = target;
    }

    if (engineOn || tween) {
      var rounded = Math.round(current * 100) / 100;
      if (window.scrollY !== rounded) {
        window.scrollTo(0, rounded);
      }
    }

    paint(window.scrollY);
    window.requestAnimationFrame(frame);
  }

  /* ---------- paint (every frame, cheap transforms only) ---------- */

  function paint(scrollY) {
    setActive(sectionAt(scrollY));

    if (scrubOn) paintHero(scrollY);
    if (missionOn) paintMission(scrollY);
    if (cabFlowOn) paintCabinetFlow(scrollY);
    paintRoute(scrollY);
    paintColors(scrollY);
  }

  /* ---------- hero scrub (scroll-scrubbed transformation) ---------- */

  function paintHero(scrollY) {
    var t = clamp(scrollY / scrubDist, 0, 1);
    if (t === lastScrubT) return;
    lastScrubT = t;

    var e = smooth(t);
    var y = Math.min(scrollY, scrubDist);

    // Banner: drifts up with the scroll, fully gone two thirds in.
    heroBg.style.opacity = (1 - smooth(clamp(t * 1.5, 0, 1))).toFixed(3);
    heroBg.style.transform = 'translate3d(0,' + (-0.22 * y).toFixed(1) + 'px,0)';

    // Card: top climbs to the viewport edge while it grows into the stage.
    heroContent.style.top = (cardTop0 * (1 - e)).toFixed(1) + 'px';
    heroContent.style.height = (cardH0 + (stageVh - cardH0) * e).toFixed(1) + 'px';
    heroContent.style.width = (cardW0 + (stageW - cardW0) * e).toFixed(1) + 'px';
    // Glass: frosted over the banner at rest, fully solid at the focus state.
    heroStage.style.setProperty('--hero-glass', e.toFixed(4));

    // Countdown: unfurls slowly through the second half of the scrub — it
    // starts fully collapsed (no dead space under the CTA at load) and grows
    // into its natural height in step with its fade.
    var r = smooth(clamp((t - 0.32) / 0.68, 0, 1));
    if (countdownEl) {
      countdownEl.style.opacity = r.toFixed(3);
      countdownEl.style.transform = 'translate3d(0,' + ((1 - r) * 12).toFixed(1) + 'px,0)';
      countdownEl.style.height = (cntH0 * r).toFixed(1) + 'px';
      countdownEl.style.marginTop = (cntMargin * r).toFixed(1) + 'px';
    }
  }

  /* ---------- mission scrub (pinned two-beat stage) ---------- */

  function paintMission(scrollY) {
    var t = clamp((scrollY - mStart) / mDist, 0, 1);
    mLastT = t;

    // Beat one holds through the sweep and its frame trace, hands over in a
    // crossfade centred before the midpoint landing, beat two holds until
    // the exit drop. Written every frame: the class toggles below depend on
    // stage visibility (IntersectionObserver), which can flip between
    // progress changes, and the early return would strand them stale.
    var swapOut = smooth(clamp((t - 0.34) / 0.14, 0, 1));
    var swapIn = smooth(clamp((t - 0.36) / 0.16, 0, 1));

    var b0 = mBeatEls[0];
    var b1 = mBeatEls[1];
    b0.style.opacity = (1 - swapOut).toFixed(3);
    b0.style.transform = 'translate3d(0,' + (-26 * swapOut).toFixed(1) + 'px,0)';
    b1.style.opacity = swapIn.toFixed(3);
    b1.style.transform = 'translate3d(0,' + (26 * (1 - swapIn)).toFixed(1) + 'px,0)';

    // Let the parent opacity own the entire crossfade. Hiding the line
    // masks at 50% left a scroll interval with neither scene readable.
    var live0 = swapOut < 1;
    var live1 = swapIn > 0;
    b0.classList.toggle('is-live', live0);
    b1.classList.toggle('is-live', live1);
    b0.inert = swapIn >= 0.5;
    b1.inert = swapIn < 0.5;

    // The line-mask reveal plays when a beat takes over while the stage is
    // actually on screen; it resets whenever either condition drops, so it
    // replays on every re-entry.
    b0.classList.toggle('lines-in', live0 && mStageSeen);
    b1.classList.toggle('lines-in', live1 && mStageSeen);
  }

  /* ---------- cabinet flow (pinned five-board stage) ---------- */

  function paintCabinetFlow(scrollY) {
    // Whole-pixel guard: the rotation is scrubbed 1:1, so sub-pixel scroll
    // noise need not reach the style layer.
    var key = Math.round(scrollY);
    if (key === lastCabScroll) return;
    lastCabScroll = key;

    // Each incoming board swings its content from 30deg around the
    // bottom-left corner to flat while its top edge travels from the
    // viewport bottom to 25% height — the FlowArt reveal geometry. The
    // board itself (sticky) wipes over the pinned previous board in the
    // same scroll; only the rotation is scrubbed here.
    for (var i = 1; i < cabPanelEls.length; i++) {
      var inner = cabInnerEls[i];
      if (!inner) continue;
      var start = cabTops[i] - vh;
      var end = cabTops[i] - vh * 0.25;
      var p = clamp((scrollY - start) / Math.max(1, end - start), 0, 1);
      var rot = 30 * (1 - smooth(p));
      inner.style.transform = rot < 0.02 ? '' : 'rotate(' + rot.toFixed(3) + 'deg)';
    }
  }

  /* ---------- boot ---------- */

  function boot() {
    heroBg = document.querySelector('.hero-bg');
    heroContent = document.querySelector('.hero-content');
    heroStage = document.querySelector('.hero-stage');
    countdownEl = document.querySelector('.countdown');
    mWrap = document.getElementById('mission');
    mStage = document.querySelector('.mission-stage');
    mBeatEls = Array.prototype.slice.call(document.querySelectorAll('.scrub-beat'));
    cabStack = document.querySelector('[data-cabinet-flow]');
    routeSvg = document.querySelector('[data-page-route]');
    if (routeSvg) {
      routeBase = routeSvg.querySelector('.route-base');
      routeLit = routeSvg.querySelector('.route-lit');
      routeDotEl = routeSvg.querySelector('.route-dot');
    }
    navLinks = Array.prototype.slice.call(document.querySelectorAll('#nav .links a'));

    setupScrub();
    setupMissionScrub();
    setupCabinetFlow();
    setupRoute();
    measure();
    bindAnchors();

    if (engineOn) {
      window.addEventListener('wheel', onWheel, { passive: false });
    }

    window.addEventListener('scroll', function () {
      // Our own scrollTo lands exactly on `current`; anything that strays is
      // the user (touch, scrollbar, keyboard), so adopt the position and
      // cancel any in-flight anchor glide. The engine never scrolls itself.
      var y = window.scrollY;
      if (Math.abs(y - current) > 1.5) {
        current = target = y;
        tween = null;
      }
    }, { passive: true });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        var wasOn = missionOn;
        setupScrub();
        setupMissionScrub();
        setupCabinetFlow();
        if (wasOn && missionOn) {
          // Re-split so line grouping follows the new wrap.
          mBeatEls.forEach(unsplitBeatLines);
        }
        setupRoute();
        measure();
        if (missionOn) mBeatEls.forEach(splitBeatLines);
      }, 160);
    });

    window.addEventListener('load', function () {
      measure();
      current = target = window.scrollY;
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        // Line grouping depends on real font metrics; re-split once the
        // webfonts are live, then re-measure.
        if (missionOn) {
          mBeatEls.forEach(unsplitBeatLines);
          mBeatEls.forEach(splitBeatLines);
        }
        measure();
      });
    }
    if ('IntersectionObserver' in window && mStage) {
      mStageIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          mStageSeen = entry.isIntersecting && entry.intersectionRatio >= 0.2;
          if (!mStageSeen) {
            mBeatEls.forEach(function (beat) { beat.classList.remove('lines-in'); });
          }
        });
      }, { threshold: [0, 0.2, 0.6] });
      mStageIO.observe(mStage);
    }

    if (window.ResizeObserver && mStage) {
      var roTimer = null;
      var ro = new ResizeObserver(function () {
        window.clearTimeout(roTimer);
        roTimer = window.setTimeout(function () { measure(); }, 140);
      });
      ro.observe(mStage);
      mBeatEls.forEach(function (beat) {
        var f = beat.querySelector('.beat-frame');
        if (f) ro.observe(f);
      });
    }
    // Late layout shifts — lazy portraits decoding, web fonts, GSAP word
    // splits — change the page height after boot. Stale geometry would
    // leave the route dot short of the footer rule at page bottom, so
    // re-measure whenever the document itself resizes.
    if (window.ResizeObserver) {
      var docRoTimer = null;
      var docRo = new ResizeObserver(function () {
        window.clearTimeout(docRoTimer);
        docRoTimer = window.setTimeout(function () { measure(); }, 160);
      });
      docRo.observe(docEl);
      if (body !== docEl) docRo.observe(body);
    }
    // GSAP splits titles into masked words after boot, which changes frame
    // geometry; re-measure once the entrance layer has settled.
    window.setTimeout(function () { measure(); }, 1200);
    window.setTimeout(function () { measure(); }, 2600);

    // Paint the first frame so the hero and route sit correctly at load.
    paint(window.scrollY);

    window.requestAnimationFrame(frame);
  }

  /* A boot failure must never be silent: every scrub and the route line
     live inside this loop, so a thrown error is recorded
     (and re-thrown for the console) instead of vanishing with the rAF
     chain. */
  function startEngine() {
    try {
      boot();
    } catch (err) {
      window.__odysseyBootErr = (err && err.stack) || String(err);
      throw err;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startEngine);
  } else {
    startEngine();
  }
})();
