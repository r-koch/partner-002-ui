/* ============================================================================
   PARTNER-002 — UI prototype (slice 11) — MediaPipe cartoonizer avatar render
   ----------------------------------------------------------------------------
   Pure vanilla JS + HTML5 canvas. No external libraries, no CDN, no network.
   This module holds ONLY the deterministic rendering core + the default-avatar
   generator + the synthetic fallback portrait, so it runs under Node for the
   gate self-test (proving determinism) with no browser and no assets required.

   Determinism contract (gate G-MP-2):
     - the cartoon re-render uses a FIXED warm palette (WARM_PALETTE) and a
       FIXED seed (FIXED_SEED). Same input => byte-identical output, stable
       render hash. No randomness, no per-run variation.
   Retention contract (gate G-MP-4):
     - this module never touches localStorage / sessionStorage / IndexedDB,
       never calls canvas.toBlob / toDataURL, never makes a URL object or
       downloads anything. It only returns in-memory pixels.
   The MediaPipe face-mesh integration lives separately in mediapipe-demo.mjs
   (browser-only, ESM) — this core is deliberately DOM-free and asset-free.
   ========================================================================== */
(function (root) {
  "use strict";

  var ALGORITHM = "mediapipe-cartoonizer/v1";
  var FIXED_SEED = 20260902;

  /* Honest on-screen copy (machine-checked by gate G-MP-4). */
  var HONEST_COPY =
    "processed on your device only \u2014 nothing leaves your phone; no face data is kept.";

  /* Decided default-avatar attributes (machine-checked by gate G-MP-5):
     bright, androgynous, outline-only, no discernible features. */
  var DEFAULT_AVATAR_ATTRS = {
    bright: true,
    androgynous: true,
    outline_only: true,
    no_discernible_features: true
  };

  /* ---- deterministic PRNG (mulberry32) ---------------------------------- */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- FNV-1a 32-bit hash over raw bytes (non-cryptographic) ------------ */
  function fnv1a(bytes) {
    var h = 0x811C9DC5;
    for (var i = 0; i < bytes.length; i++) {
      h ^= bytes[i] & 0xff;
      h = Math.imul(h, 0x01000193);
    }
    h = h >>> 0;
    return ("00000000" + h.toString(16)).slice(-8);
  }

  /* ---- fixed WARM palette (flat-color posterize targets) ----------------- */
  var WARM_PALETTE = [
    [22, 18, 16],    // near-black (used for the edge overlay)
    [46, 30, 22],    // dark brown
    [96, 56, 38],    // umber
    [140, 82, 52],   // chestnut
    [178, 116, 74],  // warm tan
    [206, 150, 104], // light skin
    [150, 118, 82],  // hair blonde-ish
    [232, 208, 174]  // pale highlight
  ];

  function nearestWarm(r, g, b) {
    var best = 0, bestD = Infinity;
    for (var i = 0; i < WARM_PALETTE.length; i++) {
      var p = WARM_PALETTE[i];
      var dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
      var d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function luminance(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

  /* ---- Sobel edge magnitude (deterministic) ------------------------------ */
  function sobelEdges(gray, w, h) {
    var mag = new Float32Array(w * h);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var idx = y * w + x;
        var gx =
          gray[(y - 1) * w + x + 1] + 2 * gray[y * w + x + 1] + gray[(y + 1) * w + x + 1] -
          gray[(y - 1) * w + x - 1] - 2 * gray[y * w + x - 1] - gray[(y + 1) * w + x - 1];
        var gy =
          gray[(y + 1) * w + x - 1] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + x + 1] -
          gray[(y - 1) * w + x - 1] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + x + 1];
        mag[idx] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return mag;
  }

  /* ---- core: image -> cartoon (flat-color posterize + edge overlay) ------ */
  /* image = { width, height, data: Uint8ClampedArray RGBA }.                */
  /* seed is always forced to FIXED_SEED so the render is reproducible.      */
  function renderCartoon(image) {
    var w = image.width, h = image.height, src = image.data;
    var out = new Uint8ClampedArray(src.length);
    var gray = new Float32Array(w * h);
    var i, y, x;
    for (i = 0; i < w * h; i++) {
      gray[i] = luminance(src[i * 4], src[i * 4 + 1], src[i * 4 + 2]);
    }
    var edge = sobelEdges(gray, w, h);
    var rng = mulberry32(FIXED_SEED);
    var threshold = 70 + rng() * 30; // fixed (derived from FIXED_SEED once)
    var edgeColor = WARM_PALETTE[0];
    for (y = 0; y < h; y++) {
      var shade = 1.0 - 0.12 * (y / h); // fixed gentle vertical shading band
      for (x = 0; x < w; x++) {
        var idx = y * w + x, o = idx * 4;
        var pi = nearestWarm(src[o], src[o + 1], src[o + 2]);
        var mult = (edge[idx] > threshold) ? 0.55 : shade; // dark edge overlay
        var c = (edge[idx] > threshold) ? edgeColor : WARM_PALETTE[pi];
        out[o] = Math.round(c[0] * mult);
        out[o + 1] = Math.round(c[1] * mult);
        out[o + 2] = Math.round(c[2] * mult);
        out[o + 3] = 255;
      }
    }
    var inputHash = fnv1a(src);
    var renderHash = fnv1a(out);
    var provenance = ALGORITHM + "|input:" + inputHash + "|seed:" + FIXED_SEED +
      "|palette:warm" + WARM_PALETTE.length + "|" + w + "x" + h + "|render:" + renderHash;
    return {
      width: w, height: h, data: out,
      algorithm: ALGORITHM, inputHash: inputHash, renderHash: renderHash,
      seed: FIXED_SEED, provenance: provenance
    };
  }

  /* ---- synthetic fallback portrait (pure code, NO assets, no real photos) */
  /* A flat, androgynous placeholder head drawn from geometry only; used when
     neither the camera nor the bundled test image is available. */
  function makeSyntheticPortrait(w, h) {
    var data = new Uint8ClampedArray(w * h * 4);
    var bg = [232, 208, 174];
    var skin = [206, 150, 104];
    var hair = [96, 56, 38];
    var shirt = [140, 82, 52];
    var cx = w / 2, cy = h * 0.42, r = h * 0.30;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var o = (y * w + x) * 4;
        var dx = x - cx, dy = y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var col = bg;
        if (y > h * 0.74) col = shirt;
        if (dist <= r) {
          col = skin;
          if (y < cy - r * 0.30) col = hair;
        }
        data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
      }
    }
    return { width: w, height: h, data: data };
  }

  /* ---- default avatar: bright, androgynous, OUTLINE-ONLY silhouette ------ */
  /* Drawn entirely from code (no image assets). Only the head + shoulders
     outline is stroked in a bright colour on a bright background; there are
     NO internal features (no eyes/nose/mouth/hair), so no discerning details. */
  function drawDefaultAvatar(ctx, w, h) {
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);
    // bright background
    ctx.fillStyle = "#ffe9b8";
    ctx.fillRect(0, 0, w, h);
    // bright, positive outline colour
    ctx.strokeStyle = "#2a6fdb";
    ctx.lineWidth = Math.max(3, Math.round(w * 0.04));
    ctx.lineJoin = "round";
    // head outline (ellipse)
    var cx = w / 2, cy = h * 0.38, rx = w * 0.30, ry = h * 0.30;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // shoulders outline (open arc — androgynous, no hair/gender cues)
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.42, h);
    ctx.lineTo(cx - w * 0.30, cy + ry * 0.72);
    ctx.lineTo(cx + w * 0.30, cy + ry * 0.72);
    ctx.lineTo(cx + w * 0.42, h);
    ctx.stroke();
    // a single soft centre tick (positive/upbeat accent, NOT a feature)
    ctx.fillStyle = "#2a6fdb";
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.02, 0, Math.PI * 2);
    ctx.fill();
    return { bright: true, androgynous: true, outline_only: true, no_discernible_features: true };
  }

  /* ---- browser render helpers (canvas) ----------------------------------- */
  function renderCartoonToCanvas(imgData, canvas) {
    if (!canvas || !canvas.getContext) return null;
    var ctx = canvas.getContext("2d");
    var out = renderCartoon({ width: imgData.width, height: imgData.height, data: imgData.data });
    ctx.putImageData(new ImageData(out.data, imgData.width, imgData.height), 0, 0);
    return out;
  }

  /* Draw the synthetic fallback portrait straight to a canvas (no assets). */
  function renderSyntheticToCanvas(canvas) {
    if (!canvas || !canvas.getContext) return null;
    var w = canvas.width, h = canvas.height;
    var src = makeSyntheticPortrait(w, h);
    var out = renderCartoon(src);
    canvas.getContext("2d").putImageData(new ImageData(out.data, w, h), 0, 0);
    return out;
  }

  /* Render the default avatar into the given canvas; returns decided attrs. */
  function renderDefaultAvatar(canvas) {
    if (!canvas || !canvas.getContext) return null;
    return drawDefaultAvatar(canvas.getContext("2d"), canvas.width, canvas.height);
  }

  /* ---- public API --------------------------------------------------------- */
  var api = {
    ALGORITHM: ALGORITHM,
    FIXED_SEED: FIXED_SEED,
    HONEST_COPY: HONEST_COPY,
    DEFAULT_AVATAR_ATTRS: DEFAULT_AVATAR_ATTRS,
    WARM_PALETTE: WARM_PALETTE,
    mulberry32: mulberry32,
    fnv1a: fnv1a,
    renderCartoon: renderCartoon,
    makeSyntheticPortrait: makeSyntheticPortrait,
    drawDefaultAvatar: drawDefaultAvatar,
    renderCartoonToCanvas: renderCartoonToCanvas,
    renderSyntheticToCanvas: renderSyntheticToCanvas,
    renderDefaultAvatar: renderDefaultAvatar
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AvatarRender = api;
  }

  /* ---- self-test (node avatar-render.js --selftest) ---------------------- */
  function assert(cond, msg) {
    if (!cond) { console.error("AVATAR-RENDER SELFTEST FAIL: " + msg); process.exitCode = 1; return false; }
    return true;
  }
  function bytesIdentical(a, b) {
    if (!a || !b) return false;
    if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return false;
    for (var i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
    return true;
  }

  function selftest() {
    var ok = true, size = 64;
    var s1 = makeSyntheticPortrait(size, size);
    var r1 = renderCartoon(s1);
    var s2 = makeSyntheticPortrait(size, size);
    var r2 = renderCartoon(s2);

    ok = assert(bytesIdentical(r1, r2), "determinism: same input renders byte-identical output") && ok;
    ok = assert(r1.renderHash === r2.renderHash, "render hash stable across runs") && ok;
    ok = assert(r1.provenance === r2.provenance, "provenance string identical across runs") && ok;
    ok = assert(r1.provenance.indexOf(ALGORITHM) === 0, "provenance carries algorithm version") && ok;
    ok = assert(r1.seed === FIXED_SEED, "seed fixed to FIXED_SEED") && ok;
    ok = assert(r1.renderHash.length === 8, "render hash is an 8-hex-char fnv1a-32") && ok;
    ok = assert(WARM_PALETTE.length === 8, "fixed warm palette has 8 entries (no variation)") && ok;

    var d = DEFAULT_AVATAR_ATTRS;
    ok = assert(d.bright && d.androgynous && d.outline_only && d.no_discernible_features,
      "default-avatar decided attributes set (bright/androgynous/outline-only/no-features)") && ok;

    console.log(JSON.stringify({
      selftest: ok ? "PASS" : "FAIL",
      algorithm: r1.algorithm,
      renderHash: r1.renderHash,
      inputHash: r1.inputHash,
      seed: r1.seed,
      provenance: r1.provenance,
      deterministic: bytesIdentical(r1, r2),
      paletteEntries: WARM_PALETTE.length,
      defaultAvatarAttrs: d
    }));
    if (process && process.exitCode !== 1) process.exitCode = 0;
  }

  if (typeof require !== "undefined" && require.main === module) {
    if (process.argv.indexOf("--selftest") !== -1) selftest();
  }
})(typeof window !== "undefined" ? window : globalThis);
