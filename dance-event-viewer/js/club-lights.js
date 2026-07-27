/* Theme-matched ambient club lighting.
   One soft bloom appears at a time at a randomized position and interval. The effect
   deliberately avoids rapid flashes and stops when the page is hidden or the visitor
   requests reduced motion. Slow sweeping beams are defined in moonlit-ember-theme.css. */
(function () {
  "use strict";

  var bloom = document.getElementById("club-light-bloom");
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var timer = 0;
  var peekerTimer = 0;
  var peekerHideTimer = 0;
  var controls = document.querySelector(".controls");
  var peeker = null;

  if (controls) {
    peeker = document.createElement("div");
    peeker.className = "panel-peeker";
    peeker.setAttribute("aria-hidden", "true");
    peeker.innerHTML = '<i class="panel-peeker-ear left"></i><i class="panel-peeker-ear right"></i>' +
      '<i class="panel-peeker-head"></i><i class="panel-peeker-eye left"></i>' +
      '<i class="panel-peeker-eye right"></i><i class="panel-peeker-snout"></i>';
    controls.insertBefore(peeker, controls.firstChild);
  }

  function random(min, max) { return min + Math.random() * (max - min); }

  function schedule() {
    window.clearTimeout(timer);
    if (!bloom || motionQuery.matches || document.hidden) return;
    timer = window.setTimeout(shine, random(2750, 6500));
  }

  function shine() {
    if (!bloom || motionQuery.matches || document.hidden) return schedule();
    var theme = getComputedStyle(document.documentElement);
    var colors = [
      theme.getPropertyValue("--accent").trim(),
      theme.getPropertyValue("--accent-pink").trim(),
      theme.getPropertyValue("--ash-c").trim()
    ].filter(Boolean);

    bloom.classList.remove("is-shining");
    void bloom.offsetWidth;
    bloom.style.left = random(8, 92).toFixed(1) + "%";
    bloom.style.top = random(12, 90).toFixed(1) + "%";
    bloom.style.setProperty("--club-bloom-time", Math.round(random(850, 1350)) + "ms");
    bloom.style.setProperty("--club-bloom-color", colors[Math.floor(Math.random() * colors.length)] || "#ffffff");
    bloom.classList.add("is-shining");
    schedule();
  }

  function schedulePeeker(initial) {
    window.clearTimeout(peekerTimer);
    window.clearTimeout(peekerHideTimer);
    if (peeker) peeker.classList.remove("is-peeking");
    if (!peeker || motionQuery.matches || document.hidden) return;
    peekerTimer = window.setTimeout(showPeeker, initial ? random(2800, 5200) : random(9000, 17000));
  }

  function showPeeker() {
    if (!peeker || motionQuery.matches || document.hidden) return schedulePeeker(false);
    var x = random(12, 88);
    peeker.style.setProperty("--peeker-x", x.toFixed(1) + "%");
    peeker.style.setProperty("--peeker-tilt", random(-8, 8).toFixed(1) + "deg");
    var controlsRect = controls.getBoundingClientRect();
    var chosenCenter = controlsRect.left + controlsRect.width * x / 100;
    var tabButtons = document.querySelectorAll(".view-btn");
    var overActualTab = Array.prototype.some.call(tabButtons, function (tabButton) {
      var tabRect = tabButton.getBoundingClientRect();
      return tabRect.width > 0 && tabRect.height > 0 &&
        chosenCenter >= tabRect.left - 10 && chosenCenter <= tabRect.right + 10;
    });
    peeker.classList.toggle("is-over-tabs", overActualTab);
    peeker.classList.add("is-peeking");
    peekerHideTimer = window.setTimeout(function () {
      peeker.classList.remove("is-peeking");
      schedulePeeker(false);
    }, random(2300, 3800));
  }

  function scheduleAll() {
    schedule();
    schedulePeeker(false);
  }

  document.addEventListener("visibilitychange", scheduleAll);
  if (motionQuery.addEventListener) motionQuery.addEventListener("change", scheduleAll);
  else if (motionQuery.addListener) motionQuery.addListener(scheduleAll);
  schedule();
  schedulePeeker(true);
})();
