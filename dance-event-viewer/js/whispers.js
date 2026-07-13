/* Dance Whispers — anonymous sidebar chat bubbles, synced live via Firebase
   Realtime Database. Shows the most recent 30 whispers to every visitor.

   Requires window.WHISPER_FIREBASE_CONFIG to be set (see index.html) before
   this script runs. If it isn't set, the widget shows a "coming soon" state
   instead of throwing — safe to ship even before Firebase is wired up.

   Server-side validation lives in the Firebase Realtime Database rules
   (see whisper-firebase-rules.json) — the filter here is a courtesy layer,
   not the security boundary. */
(function () {
  "use strict";

  var MAX_LEN = 200;
  var MIN_INTERVAL_MS = 15000; // client-side "one at a time" throttle
  var LAST_SENT_KEY = "dw_last_sent";

  // Small, deliberately short blocklist — this is an honor-system nudge for
  // a friendly local dance community, not a moderation system. Extend the
  // list below if needed; matching is case-insensitive, substring-based.
  var BLOCKLIST = [
    "fuck", "shit", "bitch", "cunt", "nigger", "faggot", "retard"
  ];

  function containsBlocked(text) {
    var lower = text.toLowerCase();
    for (var i = 0; i < BLOCKLIST.length; i++) {
      if (lower.indexOf(BLOCKLIST[i]) !== -1) return true;
    }
    return false;
  }

  function timeAgo(ts) {
    if (!ts) return "just now";
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    var days = Math.floor(hrs / 24);
    return days + "d ago";
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* Live viewer count — Sean's own troubleshooting readout (unlabeled, understated,
     see #viewer-count in index.html/styles.css). Reuses the Firebase connection already
     opened for Whispers rather than a second app instance. Each open tab claims one
     ephemeral child under "presence/", removed automatically on disconnect (tab close,
     navigation, network drop) via onDisconnect() — the standard Firebase presence pattern.
     Requires a Realtime Database rule granting read+write on "presence" (separate from the
     existing "whispers" rule); if that rule isn't present yet, the write silently fails
     and the counter just never appears — never breaks the rest of the page. */
  function initViewerPresence(db) {
    var countEl = document.getElementById("viewer-count");
    if (!countEl) return;
    try {
      var myRef = db.ref("presence").push();
      db.ref(".info/connected").on("value", function (snap) {
        if (snap.val() !== true) return;
        myRef.onDisconnect().remove();
        myRef.set(true);
      });
      db.ref("presence").on("value", function (snap) {
        countEl.textContent = String(snap.numChildren());
      });
    } catch (e) { /* nice-to-have only — never break the page over it */ }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var floatEl = document.getElementById("whisper-float");
    var minimizeBtn = document.getElementById("whisper-minimize");
    var listEl = document.getElementById("whisper-list");
    var form = document.getElementById("whisper-form");
    var input = document.getElementById("whisper-input");
    var countEl = document.getElementById("whisper-count");
    var msgEl = document.getElementById("whisper-msg");

    if (!floatEl || !form) return; // markup not present, bail quietly

    if (minimizeBtn) {
      minimizeBtn.addEventListener("click", function () {
        var collapsed = floatEl.classList.toggle("collapsed");
        minimizeBtn.setAttribute("aria-expanded", String(!collapsed));
        minimizeBtn.textContent = collapsed ? "+" : "–";
        if (!collapsed) listEl.scrollTop = listEl.scrollHeight;
      });
    }

    function updateCount() {
      var remaining = MAX_LEN - input.value.length;
      countEl.textContent = remaining;
      countEl.classList.toggle("low", remaining <= 20);
    }
    input.addEventListener("input", updateCount);
    updateCount();

    var cfg = window.WHISPER_FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey || typeof firebase === "undefined") {
      listEl.innerHTML = '<p class="whisper-empty">Whispers are coming soon &mdash; check back shortly.</p>';
      input.disabled = true;
      form.querySelector("button[type=submit]").disabled = true;
      return;
    }

    firebase.initializeApp(cfg);
    var db = firebase.database();
    var whispersRef = db.ref("whispers");

    initViewerPresence(db);

    var seenEmpty = false;
    whispersRef.orderByChild("ts").limitToLast(30).on("child_added", function (snap) {
      var w = snap.val();
      if (!w || !w.text) return;
      if (!seenEmpty) {
        var placeholder = listEl.querySelector(".whisper-empty");
        if (placeholder) placeholder.remove();
        seenEmpty = true;
      }
      var bubble = document.createElement("div");
      bubble.className = "whisper-bubble";
      bubble.innerHTML =
        "<p>" + escapeHtml(w.text) + "</p>" +
        '<span class="whisper-time" data-ts="' + (w.ts || 0) + '">' + timeAgo(w.ts) + "</span>";
      listEl.appendChild(bubble);
      listEl.scrollTop = listEl.scrollHeight;
    });

    // Refresh relative timestamps every 60s.
    setInterval(function () {
      var spans = listEl.querySelectorAll(".whisper-time");
      spans.forEach(function (s) {
        var ts = parseInt(s.getAttribute("data-ts"), 10);
        s.textContent = timeAgo(ts);
      });
    }, 60000);

    if (listEl.children.length === 0) {
      listEl.innerHTML = '<p class="whisper-empty">No whispers yet &mdash; be the first!</p>';
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      msgEl.textContent = "";
      msgEl.classList.remove("error");

      var text = input.value.trim();
      if (!text) return;
      if (text.length > MAX_LEN) {
        msgEl.textContent = "Keep it under " + MAX_LEN + " characters.";
        msgEl.classList.add("error");
        return;
      }
      if (containsBlocked(text)) {
        msgEl.textContent = "Let's keep whispers classy & fun — try rephrasing 🙂";
        msgEl.classList.add("error");
        return;
      }
      var last = parseInt(localStorage.getItem(LAST_SENT_KEY) || "0", 10);
      var wait = MIN_INTERVAL_MS - (Date.now() - last);
      if (wait > 0) {
        msgEl.textContent = "One at a time — wait " + Math.ceil(wait / 1000) + "s.";
        return;
      }

      whispersRef.push({
        text: text,
        ts: firebase.database.ServerValue.TIMESTAMP
      }).then(function () {
        localStorage.setItem(LAST_SENT_KEY, String(Date.now()));
        input.value = "";
        updateCount();
        msgEl.textContent = "Whispered ✨";
      }).catch(function () {
        msgEl.textContent = "Couldn't send that one — try again.";
        msgEl.classList.add("error");
      });
    });
  });
})();
