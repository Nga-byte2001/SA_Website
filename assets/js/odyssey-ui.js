/* Shared interaction layer for the static Odyssey pages. */
(function () {
  'use strict';

  document.documentElement.classList.add('motion-ready');

  function initMenus() {
    var toggles = document.querySelectorAll('[data-menu-toggle]');

    toggles.forEach(function (toggle) {
      var menuId = toggle.getAttribute('aria-controls');
      var menu = document.getElementById(menuId);
      if (!menu) return;

      var close = menu.querySelector('[data-menu-close]');
      var lastFocus = null;

      function focusable() {
        return Array.prototype.slice.call(menu.querySelectorAll('a[href], button:not([disabled])'));
      }

      function setOpen(open) {
        menu.classList.toggle('is-open', open);
        menu.setAttribute('aria-hidden', String(!open));
        menu.inert = !open;
        toggle.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('menu-open', open);

        if (open) {
          lastFocus = document.activeElement;
          if (close) close.focus();
        } else if (lastFocus && typeof lastFocus.focus === 'function') {
          lastFocus.focus();
        }
      }

      toggle.addEventListener('click', function () {
        setOpen(!menu.classList.contains('is-open'));
      });

      if (close) close.addEventListener('click', function () { setOpen(false); });

      menu.querySelectorAll('a[href]').forEach(function (link) {
        link.addEventListener('click', function () { setOpen(false); });
      });

      document.addEventListener('keydown', function (event) {
        if (!menu.classList.contains('is-open')) return;

        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
          return;
        }

        if (event.key !== 'Tab') return;
        var items = focusable();
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });

      window.addEventListener('resize', function () {
        if (window.innerWidth > 900 && menu.classList.contains('is-open')) {
          setOpen(false);
        }
      });
    });
  }

  function initMissingImages() {
    document.querySelectorAll('.member-photo img').forEach(function (image) {
      function markMissing() { image.classList.add('is-missing'); }
      image.addEventListener('error', markMissing, { once: true });
      if (image.complete && image.naturalWidth === 0) markMissing();
    });
  }

  function initReveals() {
    var elements = document.querySelectorAll('.reveal');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce || !('IntersectionObserver' in window)) {
      elements.forEach(function (element) {
        element.classList.add('visible');
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -10% 0px' });

    elements.forEach(function (element) {
      observer.observe(element);
    });
  }

  function initTimelineRoute() {
    var timeline = document.querySelector('.home-page .timeline');
    if (!timeline) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      timeline.classList.add('is-visible');
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -18% 0px' });

    observer.observe(timeline);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initMenus();
    initMissingImages();
    initReveals();
    initTimelineRoute();
  });
})();
