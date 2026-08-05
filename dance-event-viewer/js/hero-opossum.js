/* Replayable hero opossum interaction. Animation lives in hero-opossum.css. */
(function () {
  "use strict";

  var stage = document.getElementById("hero-opossum");
  if (!stage) return;

  var trigger = stage.querySelector(".opossum-trigger");
  var status = document.getElementById("opossum-status");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finishTimer = 0;
  var playing = false;

  function enabled() {
    var choices = " " + (document.documentElement.getAttribute("data-page-characters") || "") + " ";
    return choices.indexOf(" hero-opossum ") !== -1;
  }

  function reset() {
    window.clearTimeout(finishTimer);
    playing = false;
    stage.classList.remove("is-playing", "is-perched");
    stage.dataset.state = "hidden";
    stage.removeAttribute("aria-busy");
    trigger.disabled = !enabled();
  }

  function play(event) {
    if (!enabled() || playing) return;
    // Pointer/touch activation should not leave a large focus ring over the artwork;
    // keyboard activation keeps focus so replay remains obvious and accessible.
    if (event && event.detail > 0) trigger.blur();
    playing = true;
    window.clearTimeout(finishTimer);
    stage.classList.remove("is-playing", "is-perched");
    void stage.offsetWidth;
    stage.classList.add("is-playing");
    stage.dataset.state = "playing";
    stage.setAttribute("aria-busy", "true");
    trigger.setAttribute("aria-label", "Opossum animation playing");
    if (status) status.textContent = "The opossum lunges farther out, drops its jaw into a wide toothy snarl, then gathers itself and crawls along the banner edge.";

    finishTimer = window.setTimeout(function () {
      stage.classList.remove("is-playing");
      stage.classList.add("is-perched");
      stage.dataset.state = "perched";
      stage.removeAttribute("aria-busy");
      trigger.setAttribute("aria-label", "Replay the opossum surprise");
      trigger.title = "Replay the opossum surprise";
      if (status) status.textContent = "The opossum is perched on the side of the banner. Activate it to replay.";
      playing = false;
    }, reducedMotion.matches ? 1300 : 5250);
  }

  trigger.addEventListener("click", play);
  trigger.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    play(event);
  });
  window.addEventListener("dev-page-character-change", reset);
  if (window.DEV_PAGE_CHARACTER_READY) window.DEV_PAGE_CHARACTER_READY.then(reset);
  else reset();
})();
