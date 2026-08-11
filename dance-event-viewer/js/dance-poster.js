/* ============================================================================
   Dance Event Viewer — "Dance Card" share poster renderer (2026-07-24 redesign;
   style options added 2026-07-24b, Sean: "options for different looks").
   Draws a phone/social-friendly 4:5 poster (1080×1350) for the multi-select share.

   • renderDancePoster(entries, headline, opts) -> Promise<HTMLCanvasElement>
       entries: [{ name, whenLine, venue, cost, logoSrc }]
       opts:    { W, H, scale, month (0-11), bgImageSrc, footerUrl, style }
   • Reads the LIVE theme CSS vars off <html>, so it always matches the active
     site theme (ember / classic / …). Pure canvas — no external libs, no
     network at draw time except same-origin logos / optional seasonal image,
     so toBlob()/toDataURL() never taint.
   • style (window.DANCE_POSTER_STYLES): "seasonal" (per-month palette + motif),
     "midnight" (clean dark minimal), "bold" (vivid accent→pink), "paper" (light
     editorial). A pre-made image dropped at backgrounds/YYYY-MM.jpg overrides the
     background for the "seasonal" look only.
   ============================================================================ */
(function (global) {
  "use strict";

  var SEASONS = [
    { name: "January",   a: "#16233f", b: "#080d19", glow: "#7fb3ff", motif: "snow",  glyph: "❄" },
    { name: "February",  a: "#301431", b: "#120813", glow: "#ff7ba6", motif: "petal", glyph: "♥" },
    { name: "March",     a: "#123a2f", b: "#08170f", glow: "#5fd39a", motif: "petal", glyph: "✿" },
    { name: "April",     a: "#22381a", b: "#0d160a", glow: "#a6e06b", motif: "petal", glyph: "✿" },
    { name: "May",       a: "#123a2a", b: "#0a160f", glow: "#ffd36b", motif: "petal", glyph: "❀" },
    { name: "June",      a: "#123a4a", b: "#081720", glow: "#5fd0e6", motif: "ray",   glyph: "☀" },
    { name: "July",      a: "#3a1626", b: "#12060d", glow: "#ff8a5c", motif: "ray",   glyph: "☀" },
    { name: "August",    a: "#3a2410", b: "#140d06", glow: "#ffc15c", motif: "ray",   glyph: "☀" },
    { name: "September", a: "#2e2410", b: "#130e07", glow: "#e0a24c", motif: "leaf",  glyph: "☘" },
    { name: "October",   a: "#331a08", b: "#140a05", glow: "#ff7a2d", motif: "leaf",  glyph: "☘" },
    { name: "November",  a: "#2a1608", b: "#120905", glow: "#d98a3c", motif: "leaf",  glyph: "☘" },
    { name: "December",  a: "#0e2a24", b: "#07130e", glow: "#7fdca0", motif: "snow",  glyph: "❄" }
  ];

  // User-facing style presets (order = display order in the picker).
  var STYLES = [
    { id: "seasonal", label: "Seasonal" },
    { id: "midnight", label: "Midnight" },
    { id: "bold",     label: "Bold" },
    { id: "paper",    label: "Paper" }
  ];
  var STYLE_IDS = { seasonal: 1, midnight: 1, bold: 1, paper: 1 };

  // Layout presets (how the events are arranged). "list" = event cards; "calendar" = a
  // partial month grid with the event days highlighted + a compact agenda.
  var LAYOUTS = [
    { id: "list", label: "List" },
    { id: "calendar", label: "Calendar" }
  ];
  var LAYOUT_IDS = { list: 1, calendar: 1 };
  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  var DOW1 = ["S", "M", "T", "W", "T", "F", "S"];
  var DOW3 = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  function mulberry32(seed) {
    return function () {
      var t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hexToRgb(hex) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var v = parseInt(h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function rgba(hex, a) { var c = hexToRgb(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function mix(hexA, hexB, t) {
    var A = hexToRgb(hexA), B = hexToRgb(hexB);
    return "rgb(" + Math.round(A[0] + (B[0] - A[0]) * t) + "," + Math.round(A[1] + (B[1] - A[1]) * t) + "," + Math.round(A[2] + (B[2] - A[2]) * t) + ")";
  }
  function loadImage(src) {
    return new Promise(function (res) {
      if (!src) { res(null); return; }
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () {
        // A missing flyer/background just leaves that slot blank on the poster.
        console.warn("Poster image could not be loaded: " + src);
        res(null);
      };
      img.src = src;
    });
  }

  function renderDancePoster(entries, headline, opts) {
    opts = opts || {};
    var W = opts.W || 1080, H = opts.H || 1350, scale = opts.scale || 2;
    var month = (typeof opts.month === "number") ? opts.month : new Date().getMonth();
    var season = SEASONS[((month % 12) + 12) % 12];
    var style = STYLE_IDS[opts.style] ? opts.style : "seasonal";
    var layoutMode = LAYOUT_IDS[opts.layout] ? opts.layout : "list";
    var cs = getComputedStyle(document.documentElement);
    function V(n, f) { var s = cs.getPropertyValue(n).trim(); return s || f; };
    var theme = {
      text:   V("--text", "#f6eadf"),
      dim:    V("--text-dim", "#a99ca5"),
      card:   V("--bg-card", "#1b1822"),
      raised: V("--bg-raised", "#151624"),
      accent: V("--accent", "#e8785b"),
      pink:   V("--accent-pink", "#db8d85"),
      border: V("--border", "#3d2b37")
    };

    // Only the "seasonal" look honours a dropped-in background image.
    var wantBg = (style === "seasonal") ? opts.bgImageSrc : null;

    return Promise.all(entries.map(function (e) { return loadImage(e.logoSrc); }))
      .then(function (logos) {
        return Promise.all([logos, wantBg ? loadImage(wantBg) : Promise.resolve(null)]);
      })
      .then(function (pair) {
        var logos = pair[0], bgImg = pair[1];

        var canvas = document.createElement("canvas");
        canvas.width = W * scale; canvas.height = H * scale;
        var ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.textBaseline = "top";

        function FONT(w, sz) { return w + " " + sz + "px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"; }
        function track(px) { try { ctx.letterSpacing = px + "px"; } catch (e) {} }
        function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

        function wrap(str, font, maxW, maxLines) {
          ctx.font = font; track(0);
          var words = String(str).trim().split(/\s+/), out = [], line = "", i;
          for (i = 0; i < words.length; i++) {
            var test = line ? line + " " + words[i] : words[i];
            if (ctx.measureText(test).width > maxW && line) { out.push(line); line = words[i]; }
            else line = test;
          }
          if (line) out.push(line);
          if (maxLines && out.length > maxLines) {
            var last = out[maxLines - 1];
            while (last && ctx.measureText(last + "…").width > maxW) last = last.replace(/\s*\S+$/, "");
            out = out.slice(0, maxLines);
            out[maxLines - 1] = last + "…";
          }
          return out;
        }
        function ellipsize(str, font, maxW) {
          ctx.font = font; track(0);
          if (ctx.measureText(str).width <= maxW) return str;
          var s = str;
          while (s && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
          return s + "…";
        }

        /* ---------- the "look" (colors) for the chosen style ---------- */
        var accent = theme.accent, pink = theme.pink;
        var look = {
          text: theme.text, dim: theme.dim,
          cardFill: theme.card, cardAlpha: 0.76, cardBorder: rgba(accent, 0.18), cardShadow: 0,
          leftBar: rgba(accent, 0.85), accent: accent, when: pink, headline: theme.text,
          frame: rgba(theme.text, 0.10), footDiv: rgba(theme.text, 0.12), chipFill: rgba(accent, 0.14),
          badgeA: accent, badgeB: pink
        };
        if (style === "paper") {
          var ink = "#2a2026", inkDim = "#6f6068";
          look.text = ink; look.dim = inkDim;
          look.cardFill = "#ffffff"; look.cardAlpha = 0.92; look.cardBorder = "rgba(0,0,0,0.08)"; look.cardShadow = 1;
          look.leftBar = rgba(accent, 0.9); look.headline = "#241a1f";
          look.frame = "rgba(0,0,0,0.08)"; look.footDiv = "rgba(0,0,0,0.10)"; look.chipFill = rgba(accent, 0.12);
          look.when = mix(accent, "#000000", 0.15);
        } else if (style === "bold") {
          // Fixed festival gradient + gold accents so it's reliably punchy regardless of
          // how close the active theme's accent/pink hues happen to be.
          var gold = "#ffd15c";
          look.headline = "#ffffff"; look.accent = gold; look.when = "#ffb0d4";
          look.cardFill = "#140d20"; look.cardAlpha = 0.82; look.cardBorder = rgba(gold, 0.22); look.cardShadow = 1;
          look.leftBar = rgba(gold, 0.9); look.frame = "rgba(255,255,255,0.16)"; look.footDiv = "rgba(255,255,255,0.16)";
          look.chipFill = rgba(gold, 0.16); look.badgeA = "#ff7a4d"; look.badgeB = "#c9297f";
        }

        /* ---------- background per style ---------- */
        function glow(cx, cy, r, col, a) {
          var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          rg.addColorStop(0, rgba(col, a)); rg.addColorStop(1, rgba(col, 0));
          ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
        }
        function vgrad(top, bot) { var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bot); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
        function drawMotif() {
          var rnd = mulberry32(month * 97 + 13), i;
          ctx.save();
          if (season.motif === "ray") {
            for (i = 0; i < 7; i++) {
              var x = W * (0.1 + 0.13 * i) + (rnd() - 0.5) * 40;
              ctx.fillStyle = rgba(season.glow, 0.05 + 0.02 * rnd());
              ctx.beginPath(); ctx.moveTo(W * 0.5, -40);
              ctx.lineTo(x - 60, H * 0.9); ctx.lineTo(x + 60, H * 0.9); ctx.closePath(); ctx.fill();
            }
          } else {
            var n = season.motif === "snow" ? 46 : 30;
            for (i = 0; i < n; i++) {
              var px = rnd() * W, py = rnd() * H, s = 3 + rnd() * (season.motif === "snow" ? 5 : 9);
              ctx.globalAlpha = 0.05 + 0.06 * rnd();
              ctx.fillStyle = season.glow;
              if (season.motif === "leaf" || season.motif === "petal") {
                ctx.save(); ctx.translate(px, py); ctx.rotate(rnd() * Math.PI);
                ctx.beginPath(); ctx.ellipse(0, 0, s * 1.6, s * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
              } else {
                ctx.beginPath(); ctx.arc(px, py, s, 0, Math.PI * 2); ctx.fill();
              }
            }
          }
          ctx.restore(); ctx.globalAlpha = 1;
        }
        function beams(col) {
          ctx.save();
          for (var i = 0; i < 7; i++) {
            var x = W * (0.08 + 0.14 * i);
            ctx.fillStyle = rgba(col, 0.05 + 0.02 * ((i * 7) % 3));
            ctx.beginPath(); ctx.moveTo(W * 0.5, -60);
            ctx.lineTo(x - 70, H); ctx.lineTo(x + 70, H); ctx.closePath(); ctx.fill();
          }
          ctx.restore();
        }
        function scatterDots(col, alpha) {
          var rnd = mulberry32(7), i;
          for (i = 0; i < 26; i++) {
            ctx.globalAlpha = alpha * (0.5 + rnd());
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 2 + rnd() * 6, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        function vignette() { var rg = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.2, W / 2, H * 0.5, H * 0.75); rg.addColorStop(0, "rgba(0,0,0,0)"); rg.addColorStop(1, "rgba(0,0,0,0.42)"); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); }

        if (bgImg) {
          var cover = Math.max(W / bgImg.width, H / bgImg.height);
          var dw = bgImg.width * cover, dh = bgImg.height * cover;
          ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
          var sc = ctx.createLinearGradient(0, 0, 0, H);
          sc.addColorStop(0, rgba(season.b, 0.45)); sc.addColorStop(0.45, rgba(season.b, 0.15)); sc.addColorStop(1, rgba(season.b, 0.85));
          ctx.fillStyle = sc; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = rgba("#05060a", 0.30); ctx.fillRect(0, 0, W, H);
        } else if (style === "midnight") {
          vgrad(mix(theme.raised, "#05060b", 0.35), "#05060b");
          glow(W * 0.5, -H * 0.05, 900, accent, 0.16);
          glow(W * 0.85, H * 0.9, 620, pink, 0.10);
          vignette();
        } else if (style === "bold") {
          var g = ctx.createLinearGradient(0, 0, W * 0.4, H);
          g.addColorStop(0, "#ff7a4d"); g.addColorStop(0.5, "#c9297f"); g.addColorStop(1, "#2b1152");
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          glow(W * 0.18, H * 0.05, 620, "#ffffff", 0.14);          // sheen
          glow(W * 0.9, H * 0.4, 560, "#ff4d6d", 0.20);
          var bs = ctx.createLinearGradient(0, H * 0.5, 0, H);
          bs.addColorStop(0, "rgba(9,4,18,0)"); bs.addColorStop(1, "rgba(9,4,18,0.55)");
          ctx.fillStyle = bs; ctx.fillRect(0, 0, W, H);
        } else if (style === "paper") {
          vgrad("#faf6f0", "#efe4d7");
          glow(W * 0.85, H * 0.06, 680, accent, 0.10);
          glow(W * 0.1, H * 0.95, 620, pink, 0.07);
          scatterDots(rgba(accent, 1), 0.05);
        } else {
          // seasonal
          vgrad(season.a, season.b);
          ctx.fillStyle = rgba(theme.raised, 0.34); ctx.fillRect(0, 0, W, H);
          glow(W * 0.82, H * 0.05, 760, season.glow, 0.30);
          glow(W * 0.10, H * 0.60, 720, accent, 0.20);
          glow(W * 0.50, H * 1.02, 700, season.glow, 0.16);
          drawMotif();
        }

        /* ---------- frame ---------- */
        var M = 54, frameInset = 22;
        ctx.strokeStyle = look.frame; ctx.lineWidth = 1.5;
        rr(frameInset, frameInset, W - frameInset * 2, H - frameInset * 2, 40); ctx.stroke();
        var contentW = W - M * 2;

        /* ---------- header ---------- */
        var y = M + 8;
        ctx.fillStyle = look.accent; ctx.font = FONT("700", 25); track(3.5);
        ctx.fillText("◆ DANCE EVENT VIEWER", M, y); track(0);
        y += 25 + 22;
        var hl = String(headline), L = hl.length, fH = 74;
        if (L > 20) fH = 64; if (L > 30) fH = 56; if (L > 42) fH = 49; if (L > 56) fH = 43;
        var hlLines = wrap(hl, FONT("800", fH), contentW, 3), hLH = Math.round(fH * 1.04);
        ctx.fillStyle = look.headline; ctx.font = FONT("800", fH);
        for (var hi = 0; hi < hlLines.length; hi++) { ctx.fillText(hlLines[hi], M, y); y += hLH; }
        y += 14;
        ctx.fillStyle = look.accent; rr(M, y, 92, 6, 3); ctx.fill();
        y += 6;
        var headerBottom = y;

        /* ---------- geometry ---------- */
        var footerH = 120, footerTop = H - footerH;
        var listTop = headerBottom + 34, listBottom = footerTop - 24;
        var availList = listBottom - listTop;

        /* ============ LIST layout — the event cards ============ */
        function drawList() {
          function layout(s) {
            var padY = Math.round(26 * s), padX = Math.round(30 * s);
            var Lsz = Math.round(126 * s), lgap = Math.round(26 * s);
            var nameF = FONT("800", Math.round(40 * s)), nameLH = Math.round(46 * s);
            var whenF = FONT("600", Math.round(30 * s)), metaF = FONT("500", Math.round(27 * s));
            var whenH = Math.round(30 * s), whenGap = Math.round(10 * s), metaH = Math.round(27 * s), metaGap = Math.round(6 * s);
            var textX0 = padX + Lsz + lgap, textW = contentW - textX0 - padX;
            var blocks = entries.map(function (e, i) {
              var nameLines = wrap(e.name, nameF, textW, 2);
              var meta = [e.venue, e.cost].filter(function (v) { return typeof v === "string" && v.trim(); })
                .map(function (v) { return v.trim(); }).join("   ·   ");
              var th = nameLines.length * nameLH;
              if (e.whenLine) th += whenGap + whenH;
              if (meta) th += metaGap + metaH;
              var contentH = Math.max(Lsz, th);
              return { nameLines: nameLines, meta: meta, whenLine: e.whenLine, logo: logos[i],
                h: contentH + padY * 2, padY: padY, padX: padX, Lsz: Lsz, lgap: lgap,
                nameF: nameF, nameLH: nameLH, whenF: whenF, metaF: metaF, textX0: textX0,
                whenH: whenH, whenGap: whenGap, metaH: metaH, metaGap: metaGap };
            });
            var gap0 = Math.round(20 * s);
            var naturalH = blocks.reduce(function (a, b) { return a + b.h; }, 0) + gap0 * (entries.length - 1);
            return { blocks: blocks, gap0: gap0, naturalH: naturalH };
          }
          var steps = [1.30, 1.22, 1.14, 1.07, 1.0, 0.94, 0.88, 0.82, 0.76, 0.70, 0.64], chosen = null, si;
          for (si = 0; si < steps.length; si++) {
            chosen = layout(steps[si]);
            if (chosen.naturalH <= availList) break;
          }
          var N = entries.length, extra = availList - chosen.naturalH, gap = chosen.gap0;
          if (extra > 0 && N > 1) gap += Math.min(extra / (N + 1), 80);
          var usedH = chosen.blocks.reduce(function (a, b) { return a + b.h; }, 0) + gap * (N - 1);
          var cy = listTop + Math.max(0, (availList - usedH) / 2);

          chosen.blocks.forEach(function (b) {
            var cardX = M, cardW = contentW, cardH = b.h;
            if (look.cardShadow) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.16)"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10; }
            rr(cardX, cy, cardW, cardH, 26); ctx.fillStyle = rgba(look.cardFill, look.cardAlpha); ctx.fill();
            if (look.cardShadow) ctx.restore();
            rr(cardX, cy, cardW, cardH, 26); ctx.lineWidth = 1.5; ctx.strokeStyle = look.cardBorder; ctx.stroke();
            rr(cardX, cy + cardH * 0.18, 5, cardH * 0.64, 3); ctx.fillStyle = look.leftBar; ctx.fill();

            var lx = cardX + b.padX, ly = cy + (cardH - b.Lsz) / 2;
            ctx.save(); rr(lx, ly, b.Lsz, b.Lsz, 20); ctx.clip();
            if (b.logo) {
              var cov = Math.max(b.Lsz / b.logo.width, b.Lsz / b.logo.height);
              var lw = b.logo.width * cov, lh2 = b.logo.height * cov;
              ctx.drawImage(b.logo, lx + (b.Lsz - lw) / 2, ly + (b.Lsz - lh2) / 2, lw, lh2);
            } else {
              var bg2 = ctx.createLinearGradient(lx, ly, lx + b.Lsz, ly + b.Lsz);
              bg2.addColorStop(0, look.badgeA); bg2.addColorStop(1, look.badgeB);
              ctx.fillStyle = bg2; ctx.fillRect(lx, ly, b.Lsz, b.Lsz);
              ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.font = FONT("400", Math.round(b.Lsz * 0.5));
              ctx.textAlign = "center"; ctx.fillText("💃", lx + b.Lsz / 2, ly + b.Lsz * 0.24); ctx.textAlign = "left";
            }
            ctx.restore();
            rr(lx, ly, b.Lsz, b.Lsz, 20); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(look.text, 0.12); ctx.stroke();

            var textX = cardX + b.textX0, textW = cardW - b.textX0 - b.padX;
            var stackH = b.nameLines.length * b.nameLH;
            if (b.whenLine) stackH += b.whenGap + b.whenH;
            if (b.meta) stackH += b.metaGap + b.metaH;
            var ty = cy + (cardH - stackH) / 2;
            ctx.fillStyle = look.text; ctx.font = b.nameF;
            b.nameLines.forEach(function (ln) { ctx.fillText(ln, textX, ty); ty += b.nameLH; });
            if (b.whenLine) {
              ty += b.whenGap;
              ctx.fillStyle = look.accent; ctx.beginPath(); ctx.arc(textX + 5, ty + b.whenH * 0.5, 4.5, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = look.when; ctx.font = b.whenF;
              ctx.fillText(ellipsize(b.whenLine, b.whenF, textW - 18), textX + 18, ty);
              ty += b.whenH;
            }
            if (b.meta) {
              ty += b.metaGap;
              ctx.fillStyle = look.dim; ctx.font = b.metaF;
              ctx.fillText(ellipsize(b.meta, b.metaF, textW), textX, ty);
            }
            cy += cardH + gap;
          });
        }

        /* ============ CALENDAR layout — partial month grid + agenda ============ */
        function drawCalendar() {
          var floorD = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
          var keyD = function (d) { return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); };
          var dated = entries.filter(function (e) { return e.date instanceof Date && !isNaN(e.date); });
          if (!dated.length) { drawList(); return; }   // nothing to place → fall back

          var times = dated.map(function (e) { return floorD(e.date).getTime(); });
          var minD = new Date(Math.min.apply(null, times)), maxD = new Date(Math.max.apply(null, times));
          var start = floorD(minD); start.setDate(start.getDate() - start.getDay());   // Sunday of first week
          var end = floorD(maxD); end.setDate(end.getDate() + (6 - end.getDay()));      // Saturday of last week
          var diffDays = Math.round((end.getTime() - start.getTime()) / 86400000);
          var weeks = Math.floor(diffDays / 7) + 1;
          if (weeks > 4) weeks = 4;
          if (weeks < 1) weeks = 1;

          var dayCount = {};
          dated.forEach(function (e) { var k = keyD(floorD(e.date)); dayCount[k] = (dayCount[k] || 0) + 1; });

          var monthLabel = (minD.getMonth() === maxD.getMonth() && minD.getFullYear() === maxD.getFullYear())
            ? (MONTH_NAMES[minD.getMonth()] + " " + minD.getFullYear())
            : (MONTH_NAMES[minD.getMonth()] + " – " + MONTH_NAMES[maxD.getMonth()] + " " + maxD.getFullYear());

          var agenda = entries.slice().sort(function (a, b) {
            var at = (a.date instanceof Date && !isNaN(a.date)) ? a.date.getTime() : Infinity;
            var bt = (b.date instanceof Date && !isNaN(b.date)) ? b.date.getTime() : Infinity;
            return at - bt;
          });
          var n2 = agenda.length;

          // Size the grid cells + agenda rows to fill the space, then centre the whole block
          // vertically so a sparse 1-week card doesn't float at the top.
          var cellW = contentW / 7, dowH = 34, labelH = 46, gapAg = 26, rowGap = 12;
          var cellH = 96, rowH = 84;
          var totalH = function (cH, rH) { return labelH + (dowH + weeks * cH) + gapAg + (n2 * rH + (n2 - 1) * rowGap); };
          while (totalH(cellH, rowH) > availList && (cellH > 60 || rowH > 50)) { if (cellH > 60) cellH -= 2; if (rowH > 50) rowH -= 2; }
          while (totalH(cellH + 2, rowH + 2) <= availList && cellH < 150 && rowH < 118) { cellH += 2; rowH += 2; }
          var startY = listTop + Math.max(0, (availList - totalH(cellH, rowH)) * 0.4);

          // month label
          ctx.fillStyle = look.accent; ctx.font = FONT("700", 26); track(2);
          ctx.fillText(monthLabel.toUpperCase(), M, startY); track(0);
          var calTop = startY + labelH, gridH = dowH + weeks * cellH;

          // weekday header
          ctx.font = FONT("700", 20); track(1.5); ctx.textAlign = "center"; ctx.fillStyle = look.dim;
          for (var c = 0; c < 7; c++) ctx.fillText(DOW1[c], M + cellW * c + cellW / 2, calTop);
          track(0);

          // day cells
          var cur = new Date(start);
          for (var wk = 0; wk < weeks; wk++) {
            for (var col = 0; col < 7; col++) {
              var cxC = M + cellW * col + cellW / 2, cyC = calTop + dowH + wk * cellH + cellH / 2;
              var cnt = dayCount[keyD(cur)] || 0;
              var inMonth = (cur.getMonth() === minD.getMonth() || cur.getMonth() === maxD.getMonth());
              if (cnt > 0) {
                var r = Math.min(cellW * 0.92, cellH) * 0.4;
                ctx.beginPath(); ctx.arc(cxC, cyC, r, 0, Math.PI * 2); ctx.fillStyle = look.accent; ctx.fill();
                ctx.fillStyle = "#15100f"; ctx.font = FONT("800", Math.round(r * 0.9)); ctx.textBaseline = "middle";
                ctx.fillText(String(cur.getDate()), cxC, cyC + 1); ctx.textBaseline = "top";
                if (cnt > 1) {
                  var bx = cxC + r * 0.78, by = cyC - r * 0.78;
                  ctx.beginPath(); ctx.arc(bx, by, 13, 0, Math.PI * 2); ctx.fillStyle = look.when; ctx.fill();
                  ctx.fillStyle = "#fff"; ctx.font = FONT("700", 16); ctx.textBaseline = "middle";
                  ctx.fillText(String(cnt), bx, by + 1); ctx.textBaseline = "top";
                }
              } else {
                ctx.fillStyle = rgba(look.text, inMonth ? 0.5 : 0.22);
                ctx.font = FONT("600", 26); ctx.textBaseline = "middle";
                ctx.fillText(String(cur.getDate()), cxC, cyC + 1); ctx.textBaseline = "top";
              }
              cur.setDate(cur.getDate() + 1);
            }
          }
          ctx.textAlign = "left";

          // agenda
          var ay = calTop + gridH + gapAg;
          agenda.forEach(function (e) {
            var hasDate = e.date instanceof Date && !isNaN(e.date);
            var chipW = 94, chipH = Math.min(rowH - 8, 74), chY = ay + (rowH - chipH) / 2;
            rr(M, chY, chipW, chipH, 14); ctx.fillStyle = rgba(look.accent, 0.15); ctx.fill();
            rr(M, chY, chipW, chipH, 14); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(look.accent, 0.4); ctx.stroke();
            ctx.textAlign = "center"; ctx.fillStyle = look.accent;
            if (hasDate) {
              ctx.font = FONT("700", 19); ctx.fillText(DOW3[e.date.getDay()], M + chipW / 2, chY + 11);
              ctx.font = FONT("800", 33); ctx.fillText(String(e.date.getDate()), M + chipW / 2, chY + 30);
            } else {
              ctx.font = FONT("700", 20); ctx.fillText("TBA", M + chipW / 2, chY + chipH / 2 - 12);
            }
            ctx.textAlign = "left";
            var tx = M + chipW + 22, tw = contentW - chipW - 22;
            var nameF = FONT("800", 32), subF = FONT("500", 25);
            var sub = [e.timeText || (hasDate ? "" : e.whenLine), e.venue].filter(function (v) { return v && String(v).trim(); }).join("   ·   ");
            var nmY = ay + (rowH - (sub ? (34 + 8 + 27) : 34)) / 2;
            ctx.fillStyle = look.text; ctx.font = nameF;
            ctx.fillText(ellipsize(e.name, nameF, tw), tx, nmY);
            if (sub) {
              ctx.fillStyle = look.dim; ctx.font = subF;
              ctx.fillText(ellipsize(sub, subF, tw), tx, nmY + 34 + 8);
            }
            ay += rowH + rowGap;
          });
        }

        if (layoutMode === "calendar") drawCalendar(); else drawList();

        /* ---------- footer ---------- */
        ctx.fillStyle = look.footDiv; ctx.fillRect(M, footerTop, contentW, 1.5);
        var fy = footerTop + 30;
        ctx.fillStyle = look.accent; ctx.font = FONT("800", 30);
        ctx.fillText(opts.footerUrl || "danceeventviewer.net", M, fy);
        ctx.fillStyle = look.dim; ctx.font = FONT("500", 22);
        ctx.fillText("Find every dance in one place", M, fy + 38);
        var chip = season.glyph + "  " + season.name;
        ctx.font = FONT("600", 24); track(0.5);
        var cw = ctx.measureText(chip).width + 40;
        var chx = W - M - cw, chy = footerTop + 34, chh = 44;
        rr(chx, chy, cw, chh, 22); ctx.fillStyle = look.chipFill; ctx.fill();
        rr(chx, chy, cw, chh, 22); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(look.accent, 0.45); ctx.stroke();
        ctx.fillStyle = look.accent; ctx.textBaseline = "middle";
        ctx.fillText(chip, chx + 20, chy + chh / 2 + 1); ctx.textBaseline = "top"; track(0);

        return canvas;
      });
  }

  global.renderDancePoster = renderDancePoster;
  global.DANCE_POSTER_SEASONS = SEASONS;
  global.DANCE_POSTER_STYLES = STYLES;
  global.DANCE_POSTER_LAYOUTS = LAYOUTS;
})(window);
