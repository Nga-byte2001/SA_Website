/* Native DOM adaptations of 21st.dev's Wave Background by xubohuah and
   Spotlight Card by preetsuthar17. See docs/21st-dev-elements.md. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var ns = 'http://www.w3.org/2000/svg';

  // Reuse the same component in the policy-page headings.
  var pageHeading = document.querySelector('.subpage main > section:first-child');
  if (pageHeading) {
    var accent = document.createElement('div');
    accent.className = 'voyage-waves voyage-waves--subpage';
    accent.setAttribute('data-voyage-waves', '');
    accent.setAttribute('aria-hidden', 'true');
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('focusable', 'false');
    accent.appendChild(svg);
    pageHeading.appendChild(accent);
  }

  document.querySelectorAll('[data-voyage-waves]').forEach(function (container) {
    var svg = container.querySelector('svg');
    var surface = container.parentElement;
    var paths = [], lines = [];
    var width = 0, height = 0, frame = 0, visible = false;
    var phase = 0, until = 0, last = 0;
    var mouse = { x: -1000, y: -1000, lx: -1000, ly: -1000, sx: -1000, sy: -1000, vs: 0, a: 0 };

    function draw(advance) {
      if (advance) phase += 0.013;
      mouse.sx += (mouse.x - mouse.sx) * .1;
      mouse.sy += (mouse.y - mouse.sy) * .1;
      var dx = mouse.x - mouse.lx, dy = mouse.y - mouse.ly;
      mouse.vs += (Math.min(60, Math.hypot(dx, dy)) - mouse.vs) * .1;
      if (dx || dy) mouse.a = Math.atan2(dy, dx);
      mouse.lx = mouse.x;
      mouse.ly = mouse.y;

      lines.forEach(function (points, i) {
        var d = '';
        points.forEach(function (p, j) {
          // The source's point/cursor spring model is retained; broad sine
          // contours replace dense simplex noise to echo the banner's sea.
          var wave = Math.sin(p.x * .005 + i * .19 + phase) * height * .09
            + Math.cos(p.x * .009 - i * .13 + phase * .7) * height * .035;
          var distance = Math.hypot(p.x - mouse.sx, p.y + wave - mouse.sy);
          if (advance && distance < 175) {
            var force = (1 - distance / 175) * mouse.vs * .055;
            p.cursor.vx += Math.cos(mouse.a) * force;
            p.cursor.vy += Math.sin(mouse.a) * force;
          }
          p.cursor.vx = (p.cursor.vx - p.cursor.x * .01) * .95;
          p.cursor.vy = (p.cursor.vy - p.cursor.y * .01) * .95;
          p.cursor.x = Math.max(-30, Math.min(30, p.cursor.x + p.cursor.vx));
          p.cursor.y = Math.max(-30, Math.min(30, p.cursor.y + p.cursor.vy));
          d += (j ? 'L' : 'M') + (p.x + p.cursor.x).toFixed(1) + ',' + (p.y + wave + p.cursor.y).toFixed(1);
        });
        paths[i].setAttribute('d', d);
      });
    }

    function tick(time) {
      frame = 0;
      if (!visible || document.hidden || reduced.matches) return;
      if (time - last >= 32) { draw(true); last = time; }
      if (time < until) frame = requestAnimationFrame(tick);
    }

    function wake(duration) {
      if (!visible || document.hidden || reduced.matches) return;
      until = performance.now() + duration;
      if (!frame) frame = requestAnimationFrame(tick);
    }

    function size() {
      var rect = container.getBoundingClientRect();
      if (Math.abs(rect.width - width) < 2 && Math.abs(rect.height - height) < 2) return;
      width = rect.width;
      height = rect.height;
      if (!width || !height) return;
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      var count = width < 640 ? 10 : 17;
      var columns = Math.min(65, Math.ceil(width / 24));
      lines = [];
      while (paths.length > count) svg.removeChild(paths.pop());
      for (var i = 0; i < count; i++) {
        if (!paths[i]) {
          var path = document.createElementNS(ns, 'path');
          svg.appendChild(path);
          paths.push(path);
        }
        var points = [];
        for (var j = 0; j <= columns; j++) {
          points.push({ x: width * j / columns, y: height * (.17 + .66 * i / (count - 1)), cursor: { x: 0, y: 0, vx: 0, vy: 0 } });
        }
        lines.push(points);
      }
      draw(false);
    }

    size();
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(container);
    else window.addEventListener('resize', size, { passive: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) wake(4200);
        else { cancelAnimationFrame(frame); frame = 0; }
      }, { threshold: .05 }).observe(container);
    }

    surface.addEventListener('pointermove', function (event) {
      if (!fine.matches || reduced.matches || !visible) return;
      var rect = container.getBoundingClientRect();
      var x = event.clientX - rect.left, y = event.clientY - rect.top;
      if (mouse.x === -1000) { mouse.sx = mouse.lx = x; mouse.sy = mouse.ly = y; }
      mouse.x = x;
      mouse.y = y;
      wake(1600);
    }, { passive: true });

    reduced.addEventListener('change', function () {
      cancelAnimationFrame(frame);
      frame = 0;
      if (!reduced.matches) wake(4200);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
      else wake(1600);
    });
  });

  document.querySelectorAll('[data-spotlight], .doc-link, .service-listing-card').forEach(function (card) {
    card.setAttribute('data-spotlight', '');
    var light = document.createElement('span');
    light.className = 'odyssey-spotlight';
    light.setAttribute('aria-hidden', 'true');
    card.appendChild(light);
    function center() {
      light.style.transform = 'translate(' + (card.clientWidth / 2 - 180) + 'px,' + (card.clientHeight / 2 - 180) + 'px)';
    }
    center();
    card.addEventListener('pointermove', function (event) {
      if (!fine.matches || reduced.matches) return;
      var rect = card.getBoundingClientRect();
      light.style.transform = 'translate(' + (event.clientX - rect.left - 180) + 'px,' + (event.clientY - rect.top - 180) + 'px)';
    }, { passive: true });
    card.addEventListener('focus', center);
  });

  var months = { November: '11', December: '12', January: '01', February: '02', March: '03', April: '04', May: '05', June: '06' };
  var items = document.querySelectorAll('.timeline-item');
  items.forEach(function (item) {
    var month = item.querySelector('.timeline-date').textContent.trim();
    if (!months[month]) return;
    var plate = document.createElement('span');
    plate.className = 'event-month';
    plate.setAttribute('aria-hidden', 'true');
    plate.textContent = months[month];
    var label = document.createElement('small');
    label.textContent = month;
    plate.appendChild(label);
    item.appendChild(plate);
  });
  if ('IntersectionObserver' in window) {
    var eventObserver;
    function observeEvents() {
      if (eventObserver) eventObserver.disconnect();
      // Pixel margins use viewport height; IO percentage margins use width.
      eventObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { entry.target.classList.toggle('is-current', entry.isIntersecting); });
      }, { rootMargin: '-' + Math.round(innerHeight * .25) + 'px 0px -' + Math.round(innerHeight * .35) + 'px 0px', threshold: 0 });
      items.forEach(function (item) { eventObserver.observe(item); });
    }
    if (items.length) {
      observeEvents();
      window.addEventListener('resize', observeEvents, { passive: true });
    }
  }
})();
