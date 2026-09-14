/* Odyssey GSAP layer.
   Premium motion on top of the vendored GSAP + ScrollTrigger
   (assets/js/vendor): masked word reveals for titles, staggered content
   entrances, and a refined hero arrival. This layer only plays ENTER
   animations — scrolling itself stays owned by assets/js/odyssey-motion.js,
   so nothing here scrubs or hijacks scroll.

   Progressive enhancement: if the vendor files are missing or anything in
   here throws, the html.gsap-on class is never added (or is removed) and the
   legacy CSS/IO reveal system takes over. prefers-reduced-motion users get
   none of this layer. */
(function () {
  'use strict';

  if (!window.gsap || !window.ScrollTrigger || !document.body) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  try {
    gsap.registerPlugin(ScrollTrigger);
    gsap.config({ nullTargetWarn: false });

    var isHome = document.body.classList.contains('home-page');
    // Signals the CSS layer to stand down its legacy entrance/reveal states.
    document.documentElement.classList.add('gsap-on');

    /* ---------- helpers ---------- */

    // Wrap words in overflow-hidden masks so they can rise into view. Inline
    // child elements (<em>, <span>) count as a single word, so styling and
    // CJK phrases survive intact. Split content is aria-hidden and the
    // original text moves to aria-label for screen readers.
    function splitWords(el) {
      var label = (el.textContent || '').replace(/\s+/g, ' ').trim();
      var wrap = document.createElement('span');
      wrap.className = 'gsap-text';
      wrap.setAttribute('aria-hidden', 'true');

      function mask(inner) {
        var m = document.createElement('span');
        m.className = 'gsap-mask';
        var w = document.createElement('span');
        w.className = 'gsap-word';
        w.appendChild(inner);
        m.appendChild(w);
        wrap.appendChild(m);
        wrap.appendChild(document.createTextNode(' '));
      }

      Array.prototype.slice.call(el.childNodes).forEach(function (node) {
        if (node.nodeType === 3) {
          node.textContent.split(/\s+/).forEach(function (word) {
            if (word) mask(document.createTextNode(word));
          });
        } else if (node.nodeType === 1 && node.tagName !== 'BR') {
          mask(node);
        } else if (node.nodeType === 1) {
          wrap.appendChild(node);
        }
      });

      el.innerHTML = '';
      el.appendChild(wrap);
      el.setAttribute('aria-label', label);
      return wrap.querySelectorAll('.gsap-word');
    }

    // Fade-and-rise entrance, batched per scroll pass. clearProps hands the
    // finished element back to CSS so hover transforms keep working.
    function riseIn(targets, vars) {
      if (!targets || !targets.length) return;
      gsap.set(targets, { opacity: 0, y: 30 });
      ScrollTrigger.batch(targets, {
        start: 'top 88%',
        once: true,
        onEnter: function (batch) {
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.85,
            ease: 'power3.out',
            stagger: 0.08,
            clearProps: 'opacity,transform,filter',
            overwrite: true,
          });
        },
      });
    }

    // Title entrance: words rise out of their masks while the element's
    // existing underline sweep stays owned by the CSS layer.
    function titleReveal(titles) {
      Array.prototype.forEach.call(titles, function (title) {
        var words = splitWords(title);
        gsap.set(words, { yPercent: 118 });
        ScrollTrigger.create({
          trigger: title,
          start: 'top 88%',
          once: true,
          onEnter: function () {
            gsap.to(words, {
              yPercent: 0,
              duration: 0.9,
              ease: 'power4.out',
              stagger: 0.055,
              clearProps: 'transform',
            });
          },
        });
      });
    }

    /* ---------- global touches ---------- */

    // Nav slides in once on arrival.
    var nav = document.getElementById('nav');
    if (nav) {
      gsap.from(nav, {
        yPercent: -100,
        duration: 0.7,
        ease: 'power3.out',
        delay: 0.05,
        clearProps: 'transform',
      });
    }

    // Countdown digits roll in instead of just fading when a value changes.
    // The inline script exposes setUnit globally; wrap it and let GSAP own the
    // motion (the CSS tick animation is suppressed under html.gsap-on). The
    // roll and the fade are separate tweens so the fade can linger longer
    // than the movement.
    if (typeof window.setUnit === 'function') {
      var baseSetUnit = window.setUnit;
      window.setUnit = function (id, value) {
        var el = document.getElementById(id);
        var changed = !!el && el.textContent !== String(value);
        baseSetUnit(id, value);
        if (changed) {
          gsap.fromTo(el, { yPercent: -55 }, {
            yPercent: 0,
            duration: 0.65,
            ease: 'power3.out',
            overwrite: 'auto',
            clearProps: 'transform',
          });
          gsap.fromTo(el, { opacity: 0 }, {
            opacity: 1,
            duration: 0.9,
            ease: 'power2.out',
            overwrite: 'auto',
            clearProps: 'opacity',
          });
        }
      };
    }

    // Magnetic pull: the CTA leans toward the cursor and springs back, with
    // a GSAP-owned press so the inline transform never blocks :active styles.
    function attachMagneticCta() {
      var cta = document.querySelector('.hero-cta');
      if (!cta || !window.matchMedia('(pointer: fine)').matches) return;
      var xTo = gsap.quickTo(cta, 'x', { duration: 0.45, ease: 'power3.out' });
      var yTo = gsap.quickTo(cta, 'y', { duration: 0.45, ease: 'power3.out' });
      cta.addEventListener('mousemove', function (e) {
        var r = cta.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.16);
        yTo((e.clientY - r.top - r.height / 2) * 0.34);
      });
      cta.addEventListener('mouseleave', function () { xTo(0); yTo(0); });
      cta.addEventListener('mousedown', function () {
        gsap.to(cta, { scale: 0.96, duration: 0.12, ease: 'power2.out' });
      });
      window.addEventListener('mouseup', function () {
        gsap.to(cta, { scale: 1, duration: 0.3, ease: 'power2.out' });
      });
    }

    /* ---------- home page ---------- */

    if (isHome) {
      var heroImg = document.querySelector('.hero-bg img');
      var heroTitle = document.querySelector('.hero-title');
      var heroChildren = document.querySelectorAll('.hero-content > *:not(.countdown):not([aria-hidden="true"])');
      var heroBits = Array.prototype.filter.call(heroChildren, function (el) {
        return !heroTitle || !el.contains(heroTitle);
      });

      gsap.set(heroBits, { opacity: 0, y: 26, filter: 'blur(8px)' });
      var heroWords = heroTitle ? splitWords(heroTitle) : [];
      if (heroWords.length) gsap.set(heroWords, { yPercent: 118 });

      var hero = gsap.timeline({ delay: 0.15, defaults: { ease: 'power3.out' } });
      if (heroImg) {
        hero.from(heroImg, {
          opacity: 0.35,
          scale: 1.06,
          duration: 1.5,
          ease: 'power2.inOut',
          clearProps: 'opacity,transform',
        }, 0);
      }
      hero.to(heroBits, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.9,
        stagger: 0.09,
        clearProps: 'opacity,transform,filter',
      }, 0.25);
      hero.to(heroWords, {
        yPercent: 0,
        duration: 1,
        ease: 'power4.out',
        stagger: 0.07,
        clearProps: 'transform',
      }, 0.45);

      // Ambient layer starts once the arrival finishes: a slow Ken Burns
      // drift on the banner, then the magnetic CTA takes over its transform.
      var startAmbient = function () {
        if (heroImg) {
          gsap.to(heroImg, {
            scale: 1.05,
            x: 14,
            duration: 18,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
          });
        }
        attachMagneticCta();
      };
      hero.eventCallback('onComplete', startAmbient);

      // The events line fills with solid orange as the reader travels it —
      // the same journey-progress idea as the rail, kept at 1:1 with scroll.
      var timelineEl = document.querySelector('.home-page .timeline');
      if (timelineEl) {
        ScrollTrigger.create({
          trigger: timelineEl,
          start: 'top 78%',
          end: 'bottom 40%',
          onUpdate: function (self) {
            timelineEl.style.setProperty('--tl-fill', (self.progress * 100).toFixed(2));
          },
        });
      }

      // The mission scrub stage owns its copy: beats live absolutely stacked
      // in a pinned viewport, so viewport-based entrance triggers fire at the
      // wrong time there (empty frames, half-hidden copy). Everything inside
      // .scrub-mission is lit by the scrub itself.
      function inScrubStage(el) {
        return !!(el.closest && el.closest('.scrub-mission'));
      }

      // Same idea for the cabinet flow stage (odyssey-motion.js): while its
      // boards are pinned and swept by scroll, their members are lit by the
      // scrub, not by entrance triggers. When the stage is off (narrow or
      // short viewports) its members stay in the entrance system.
      function inFlowStage(el) {
        return document.documentElement.classList.contains('cabinet-flow') &&
               !!(el.closest && el.closest('.flow-stack'));
      }

      titleReveal(Array.prototype.filter.call(
        document.querySelectorAll('.section-title'),
        function (t) { return !inScrubStage(t); }
      ));
      riseIn(Array.prototype.filter.call(
        document.querySelectorAll('.content-block'),
        function (el) { return !inScrubStage(el); }
      ));
      riseIn(document.querySelectorAll('.timeline .timeline-item'));
      riseIn(Array.prototype.filter.call(
        document.querySelectorAll('.cabinet-member'),
        function (el) { return !inFlowStage(el); }
      ));
      riseIn(Array.prototype.filter.call(
        document.querySelectorAll('.pillar-link'),
        function (el) { return !inScrubStage(el); }
      ));
      riseIn(document.querySelectorAll('.doc-link'));
      riseIn(document.querySelectorAll('.home-page .footer-inner'));

      var showcase = document.querySelector('.logo-showcase');
      if (showcase) {
        var showcaseImg = showcase.querySelector('img');
        var showcaseText = showcase.querySelectorAll('h3, p');
        gsap.set(showcaseImg, { opacity: 0, scale: 0.86, rotate: -8 });
        gsap.set(showcaseText, { opacity: 0, y: 20 });
        // Gentle parallax drift on the badge while the section passes.
        gsap.fromTo(showcaseImg, { yPercent: 8 }, {
          yPercent: -8,
          ease: 'none',
          scrollTrigger: {
            trigger: showcase,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.6,
          },
        });
        ScrollTrigger.create({
          trigger: showcase,
          start: 'top 78%',
          once: true,
          onEnter: function () {
            gsap.to(showcaseImg, {
              opacity: 1, scale: 1, rotate: 0,
              duration: 1.1, ease: 'power3.out',
              clearProps: 'opacity',
            });
            gsap.to(showcaseText, {
              opacity: 1, y: 0,
              duration: 0.8, ease: 'power3.out', stagger: 0.09, delay: 0.25,
              clearProps: 'opacity,transform',
            });
          },
        });
      }

      // Portraits settle in with a small pop, independent of the row fades.
      var photos = Array.prototype.filter.call(
        document.querySelectorAll('.cabinet-member .member-photo'),
        function (el) { return !inFlowStage(el); }
      );
      if (photos.length) {
        gsap.set(photos, { scale: 0.9 });
        ScrollTrigger.batch(photos, {
          start: 'top 90%',
          once: true,
          onEnter: function (batch) {
            gsap.to(batch, {
              scale: 1,
              duration: 0.8,
              ease: 'back.out(1.5)',
              stagger: 0.06,
              clearProps: 'transform',
            });
          },
        });
      }
    }

    /* ---------- subpages ---------- */

    else {
      var head = document.querySelector('body.subpage section:first-of-type .text-center');
      if (head) {
        var heading = head.querySelector('h1') || head.querySelector('h2');
        var line = head.querySelector('.accent-line');
        var bits = head.querySelectorAll(':scope > p, :scope > .accent-line');

        var words = heading ? splitWords(heading) : [];
        if (words.length) gsap.set(words, { yPercent: 118 });
        gsap.set(bits, { opacity: 0, y: 18 });

        var hero = gsap.timeline({ delay: 0.1, defaults: { ease: 'power3.out' } });
        hero.to(words, {
          yPercent: 0,
          duration: 0.9,
          ease: 'power4.out',
          stagger: 0.06,
          clearProps: 'transform',
        }, 0.1);
        hero.to(bits, {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.1,
          clearProps: 'opacity,transform',
        }, 0.35);
      }

      titleReveal(document.querySelectorAll('.glass-warm h2, .glass-warm h3'));
      riseIn(document.querySelectorAll(
        '.glass-warm .grid > div, .glass-warm .space-y-4 > div'
      ));
      riseIn(document.querySelectorAll('.service-listing-card'));
      riseIn(document.querySelectorAll('.service-panel--ordering, .glass > p'));
    }

    /* ---------- keep triggers honest ---------- */

    window.addEventListener('load', function () {
      ScrollTrigger.refresh();
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        ScrollTrigger.refresh();
      });
    }
  } catch (err) {
    // Any failure: strip the flag and every inline state this layer wrote so
    // the legacy CSS/IO reveal system can take over cleanly.
    document.documentElement.classList.remove('gsap-on');
    if (window.gsap) gsap.globalTimeline.clear();
    if (window.ScrollTrigger) ScrollTrigger.getAll().forEach(function (t) { t.kill(); });
    Array.prototype.forEach.call(
      document.querySelectorAll('.gsap-word'),
      function (w) { w.style.transform = ''; }
    );
  }
})();
