/* Small low-poly Blue Angels flyover selected from the admin appearance panel. */
(function () {
  "use strict";

  var jet = document.querySelector(".blue-angels-flight");
  if (!jet) return;

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var points = [
    [-0.16, 0.18], [0.18, 0.10], [0.58, 0.18], [1.12, 0.38],
    [0.92, 0.67], [0.54, 0.78], [0.12, 0.67], [-0.15, 0.86]
  ];
  var duration = 18000;
  var startedAt = performance.now();
  var frameId = 0;

  function enabled() {
    return (" " + document.documentElement.getAttribute("data-page-characters") + " ").indexOf(" blue-angels ") !== -1 &&
      !motionQuery.matches && !document.hidden;
  }

  function point(index) { return points[(index + points.length) % points.length]; }
  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t;
    var t3 = t2 * t;
    return [0, 1].map(function (axis) {
      return 0.5 * ((2 * p1[axis]) + (-p0[axis] + p2[axis]) * t +
        (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
        (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3);
    });
  }
  function sample(progress) {
    var scaled = progress * points.length;
    var segment = Math.floor(scaled) % points.length;
    return catmull(point(segment - 1), point(segment), point(segment + 1), point(segment + 2), scaled - Math.floor(scaled));
  }

  function draw(now) {
    frameId = 0;
    if (!enabled()) return;
    var progress = ((now - startedAt) % duration) / duration;
    var here = sample(progress);
    var ahead = sample((progress + 0.001) % 1);
    var dx = (ahead[0] - here[0]) * window.innerWidth;
    var dy = (ahead[1] - here[1]) * window.innerHeight;
    var headingLeft = dx < 0;
    var angle = Math.atan2(dy, dx) * 180 / Math.PI + (headingLeft ? 180 : 0);
    var bank = Math.max(-12, Math.min(12, dy * 0.045));
    var x = here[0] * window.innerWidth - jet.offsetWidth / 2;
    var y = here[1] * window.innerHeight - jet.offsetHeight / 2;
    var depthScale = 0.88 + here[1] * 0.22;
    jet.style.transform = "translate3d(" + x + "px," + y + "px,0) rotate(" +
      (angle + bank) + "deg) scaleX(" + (headingLeft ? -1 : 1) + ") scale(" + depthScale + ")";
    frameId = window.requestAnimationFrame(draw);
  }

  function sync() {
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
    startedAt = performance.now();
    if (enabled()) frameId = window.requestAnimationFrame(draw);
  }

  window.addEventListener("dev-page-character-change", sync);
  document.addEventListener("visibilitychange", sync);
  if (motionQuery.addEventListener) motionQuery.addEventListener("change", sync);
  else if (motionQuery.addListener) motionQuery.addListener(sync);
  if (window.DEV_PAGE_CHARACTER_READY) window.DEV_PAGE_CHARACTER_READY.then(sync);
  else sync();
})();
