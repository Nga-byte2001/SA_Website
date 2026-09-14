/* Odyssey motion engine.
   Scroll-driven story mechanics in the style of meuze.ai: inertial wheel
   scrolling with settle-to-section snapping, a scroll-scrubbed hero
   transformation, a pinned two-beat mission stage whose frame the dot
   traces, a continuous zig-zag route line that runs the whole page
   (horizontal runs inside sections, drops between them) with graphics that
   light up as the dot passes, and background colour that shifts between
   sections. Fine pointers get the wheel engine; touch keeps native
   scrolling plus every scrub. Reduced motion disables all of it. */
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
  var stops = [];        // scroll positions that read as a section landing
  var tops = [];         // document-space top of each section
  var current = window.scrollY;   // smoothed position
  var target = window.scrollY;    // where the wheel wants to go
  var lastWheelAt = 0;
  var tween = null;      // {from, to, start, duration}
  var activeIndex = -1;
  var navLinks = [];
  var heroBg = null;
  var heroContent = null;
  var heroStage = null;
  var countdownEl = null;
  var scrollCueEl = null;

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
  var lastTouchY = 0;
  var lastTouchScrollAt = 0;
  var touchDir = 1;
  var hasUserInput = false; // no scrub pull before the user actually scrolls

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

  /* Page route state (html.route-on): the zig-zag line + travelling dot. */
  var routeOn = false;
  var colorOn = false;
  var routeSvg = null;
  var routeBase = null;
  var routeLit = null;
  var routeDotEl = null;
  var xSpine = 24;       // vertical runs: aligned with the timeline spine
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

  var SETTLE_DELAY = 150;      // ms of wheel silence before a settle snap
  var LERP = 0.1;              // approach factor per frame (meuze uses 0.12)
  var SNAP_WINDOW = 0.34;      // share of viewport: glide to a nearby stop
  var PULL_WINDOW = 0.62;      // share of viewport: pulled to the next stop
  var TAIL_WINDOW = 0.55;      // share of viewport: pulled to page bottom
  var SCRUB_MIN_VIEWPORT = 520; // px: below this the static stacked layout stays
  var SCRUB_MIN_BANNER = 170;   // px: shortest banner worth showing at load
  var TOUCH_SETTLE_DELAY = 350; // ms of touch scroll silence before completing
  var ROUTE_MIN_VIEWPORT = 900; // px: the route line needs the room

  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  // smoothstep, the same easing family meuze scrubs with
  var smooth = function (t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

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
      if (scrollCueEl) scrollCueEl.style.opacity = '';
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
    });
    mLastT = -1;
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
    }

    var docH = docEl.scrollHeight;
    maxScroll = Math.max(1, docH - vh);
    tops = SECTIONS.map(function (s) {
      if (scrubOn && s.id === 'countdown') return scrubDist;
      var el = document.querySelector(s.selector);
      return el ? el.offsetTop : 0;
    });
    stops = tops.slice(0, -1).concat([maxScroll]);
    if (missionOn) {
      // The beat crossfade settles at midpoint: an explicit landing so a
      // flick from beat one rests on beat two instead of mid-swap.
      stops.splice(sectionIndex('mission') + 1, 0, mStart + mDist * 0.52);
    }

    measureRoute();
  }

  /* Route geometry, all document-space. */
  function measureRoute() {
    if (!routeOn) return;

    var eventsEl = document.querySelector('#events');
    if (eventsEl) {
      // X is scroll-invariant: the route SVG is fixed to the viewport, so
      // the spine takes the container's viewport left edge. Adding scrollY
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
        return { el: el, y: el.getBoundingClientRect().top + window.scrollY + 64 };
      });

    var show = document.querySelector('.logo-showcase');
    if (show) {
      var sr2 = show.getBoundingClientRect();
      var showTop = sr2.top + window.scrollY;
      showMid = showTop + sr2.height * 0.5;

      // The cabinet→logo diagonal lives in the air between the two
      // sections: centred on their border, rising at most a sixth of the
      // viewport on each side but never into the last portrait row or the
      // badge. Measured on load-state rects, so entrance transforms
      // (translateY/scale set by the GSAP layer) can only shrink the
      // rise — the 56px floor keeps the diagonal out of trouble.
      var rise = vh / 6;
      var lastRow = document.querySelector('.cabinet-row:last-of-type');
      if (lastRow) {
        rise = Math.min(rise, Math.max(56,
          showTop - (lastRow.getBoundingClientRect().bottom + window.scrollY) - 28));
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
  }

  function cLeftSet(left, width) {
    xSpine = left + 3.5;
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

    // The terminal vertex is reached exactly when the scroll bottoms out:
    // whatever the viewport, the last approach reads as completing the
    // journey on the footer rule, not stalling short of it.
    if (A.length > 1) {
      A[A.length - 1] = Math.max(A[A.length - 1], A[A.length - 2] + 1, maxScroll);
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
    routeSvg.style.opacity = appear.toFixed(3);
    if (appear <= 0.01) return;

    var pt = routePointAt(scrollY);
    var V = pt.V;

    // Smooth the dot along the line; big jumps (resize, anchor glide) snap.
    if (!isFinite(pt.x) || !isFinite(pt.y)) return;
    if (dotX < -50 || Math.abs(pt.x - dotX) > vw * 1.5 || Math.abs(pt.y - dotY) > vh * 2) {
      dotX = pt.x; dotY = pt.y;
    } else {
      dotX += (pt.x - dotX) * 0.42;
      dotY += (pt.y - dotY) * 0.42;
    }

    // One line, one trail: the dim path is the whole circuit, the lit path
    // is exactly the part the dot has travelled. Both rebuild from the same
    // vertices every frame, so the lit line can never separate from the
    // route or from the dot, and the frame morph carries both together.
    var li = pt.i;
    var d = 'M' + V.map(function (v) { return v[0].toFixed(1) + ' ' + v[1].toFixed(1); }).join('L');
    if (d !== routeBuiltD) {
      routeBase.setAttribute('d', d);
      routeBuiltD = d;
    }

    var t2 = [];
    for (var k = 0; k <= li && k < V.length; k++) t2.push(V[k]);
    t2.push([pt.x, pt.y]);
    routeLit.setAttribute('d', 'M' + t2.map(function (v) { return v[0].toFixed(1) + ' ' + v[1].toFixed(1); }).join('L'));


    routeDotEl.setAttribute('transform', 'translate(' + (dotX - 4).toFixed(1) + ' ' + (dotY - 4).toFixed(1) + ')');

    // Graphics light up as the dot passes them.
    var dotDocY = dotY + scrollY;
    cabRows.forEach(function (row) {
      row.el.classList.toggle('is-lit', dotDocY >= row.y);
    });
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

  /* ---------- settle snapping ---------- */

  /* Inside the hero scrub range: upward travel always carries the
     transformation back to the top; downward travel completes it forward
     unless the user barely entered (a stray few pixels snaps back like any
     other section). */
  function scrubSettleTarget(y, direction) {
    if (direction < 0) return 0;
    return y < scrubDist * 0.25 ? 0 : scrubDist;
  }

  function settle() {
    if (window.__odysseyNoSettle) return;
    var y = target;
    var direction = settleDirection || 0;
    var best = null;

    // The hero scrub range pulls only after real input — at a fresh load the
    // engine must idle on the stacked banner, not morph itself away.
    if (scrubOn && hasUserInput && y < scrubDist - 2) {
      best = scrubSettleTarget(y, direction);
    } else if (missionOn && y > mStart + 2 && y < mStart + mDist - 2) {
      // Inside the mission stage, travel is stage-wise: every flick lands
      // on the next (or previous) beat state, never mid-scrub.
      var m1 = mStart + mDist * 0.52;
      if (direction < 0) best = y > m1 + 2 ? m1 : mStart;
      else best = y < m1 - 2 ? m1 : mStart + mDist;
    } else if (maxScroll - y < vh * TAIL_WINDOW) {
      // Page bottom always wins when we are close to the end.
      best = maxScroll;
    } else {
      var upper = null;
      var lower = null;
      stops.forEach(function (stop) {
        if (stop < y - 2 && (upper === null || stop > upper)) upper = stop;
        if (stop > y + 2 && (lower === null || stop < lower)) lower = stop;
      });

      if (direction >= 0 && lower !== null && lower - y < vh * PULL_WINDOW) {
        best = lower;
      } else if (direction <= 0 && upper !== null && y - upper < vh * PULL_WINDOW) {
        best = upper;
      } else {
        // Neutral: glide to whichever stop is within the near window.
        var nearest = null;
        [upper, lower].forEach(function (stop) {
          if (stop === null) return;
          if (Math.abs(stop - y) < vh * SNAP_WINDOW) nearest = stop;
        });
        best = nearest;
      }
    }

    if (best !== null && Math.abs(best - y) > 2) glideTo(best);
  }

  var settleDirection = 1;

  /* ---------- wheel ---------- */

  function onWheel(event) {
    if (!event.isTrusted || event.ctrlKey) return;
    if (body.classList.contains('menu-open')) return;
    var delta = event.deltaY;
    if (event.deltaMode === 1) delta *= 16;
    else if (event.deltaMode === 2) delta *= vh;

    event.preventDefault();
    if (tween) tween = null;
    hasUserInput = true;
    target = clamp(target + delta, 0, maxScroll);
    if (delta !== 0) settleDirection = delta > 0 ? 1 : -1;
    lastWheelAt = performance.now();
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
          settleDirection = y >= target ? 1 : -1;
          glideTo(y);
        }
        if (history.pushState) history.pushState(null, '', hash);
      });
    });
  }

  /* ---------- frame loop ---------- */

  function frame(now) {
    // Tweens run on every device (touch users glide from taps too); the
    // inertial chase and settle snapping are fine-pointer only.
    if (tween) {
      var t = clamp((now - tween.start) / tween.duration, 0, 1);
      var v = tween.from + (tween.to - tween.from) * smooth(t);
      // The tween owns the position outright. Chasing it with the lerp
      // instead would leave a mushy ~700ms tail after every landing.
      target = v;
      current = v;
      if (t >= 1) { target = tween.to; current = tween.to; tween = null; lastWheelAt = now; }
    } else if (engineOn) {
      current += (target - current) * LERP;
      if (Math.abs(target - current) < 0.12) current = target;
    }

    if (engineOn || tween) {
      var rounded = Math.round(current * 100) / 100;
      if (window.scrollY !== rounded) {
        window.scrollTo(0, rounded);
      }

      if (engineOn && !tween && current === target && now - lastWheelAt > SETTLE_DELAY) {
        settle();
      }
    } else if (!reduceMotion && !tween && now - lastTouchScrollAt > TOUCH_SETTLE_DELAY) {
      // Touch has no wheel engine, so after the finger stops, finish any
      // hero transformation left hanging mid-way rather than rest
      // half-morphed.
      var ty = window.scrollY;
      if (scrubOn && ty > 2 && ty < scrubDist - 2) {
        settleDirection = touchDir;
        glideTo(scrubSettleTarget(ty, touchDir));
        lastTouchScrollAt = now;
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
    if (scrollCueEl) scrollCueEl.style.opacity = (0.8 * (1 - smooth(clamp(t * 3, 0, 1)))).toFixed(3);
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

    var live0 = swapOut < 0.5;
    var live1 = swapIn >= 0.5;
    b0.classList.toggle('is-live', live0);
    b1.classList.toggle('is-live', live1);

    // The line-mask reveal plays when a beat takes over while the stage is
    // actually on screen; it resets whenever either condition drops, so it
    // replays on every re-entry.
    b0.classList.toggle('lines-in', live0 && mStageSeen);
    b1.classList.toggle('lines-in', live1 && mStageSeen);
  }

  /* ---------- boot ---------- */

  function boot() {
    heroBg = document.querySelector('.hero-bg');
    heroContent = document.querySelector('.hero-content');
    heroStage = document.querySelector('.hero-stage');
    countdownEl = document.querySelector('.countdown');
    scrollCueEl = document.querySelector('.scroll-cue');
    mWrap = document.getElementById('mission');
    mStage = document.querySelector('.mission-stage');
    mBeatEls = Array.prototype.slice.call(document.querySelectorAll('.scrub-beat'));
    routeSvg = document.querySelector('[data-page-route]');
    if (routeSvg) {
      routeBase = routeSvg.querySelector('.route-base');
      routeLit = routeSvg.querySelector('.route-lit');
      routeDotEl = routeSvg.querySelector('.route-dot');
    }
    navLinks = Array.prototype.slice.call(document.querySelectorAll('#nav .links a'));

    setupScrub();
    setupMissionScrub();
    setupRoute();
    measure();
    bindAnchors();

    if (engineOn) {
      window.addEventListener('wheel', onWheel, { passive: false });
    }

    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if (!engineOn) {
        // Touch: keep the tween's `from` honest while the user scrolls and
        // remember the travel direction for the scrub-completion settle.
        if (y > lastTouchY + 1) touchDir = 1;
        else if (y < lastTouchY - 1) touchDir = -1;
        lastTouchY = y;
        lastTouchScrollAt = performance.now();
        current = target = y;
        return;
      }
      // Our own scrollTo lands exactly on `current`; anything that strays is
      // the scrollbar or the keyboard, so hand control back to the user.
      // (A time-based guard here misfires on late-delivered scroll events
      // and aborts settle glides a few pixels early.)
      if (Math.abs(y - current) > 1.5) {
        settleDirection = y > current ? 1 : -1;
        hasUserInput = true;
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
