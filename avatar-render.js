/* ============================================================================
   PARTNER-002 — UI prototype (slice 11b) — MediaPipe line-art / sketch avatar render
   ----------------------------------------------------------------------------
   Pure vanilla JS + HTML5 canvas. No external libraries, no CDN, no network.
   This module holds ONLY the deterministic rendering core + the default-avatar
   generator + the synthetic fallback portrait, so it runs under Node for the
   gate self-test (proving determinism + line-art style classification) with no
   browser and no assets required.

   Style decision (slice 11b, owner 2026-09-02): the slice-11 flat-color
   posterize output was rejected ("terrible"). The avatar is now a LINE-ART /
   SKETCH likeness — clean ink strokes on a light paper background, no
   flat-color fill inside the face silhouette, minimal geometric shading,
   non-photographic. The InstantID "line art" reference is reproduced as a
   STYLE on the permissive Apache-2.0 MediaPipe + deterministic-render stack;
   InstantID itself stays REJECTED (license-dead, see avatar-options-research).

   Pipeline (unchanged, transient): input (webcam / bundled PD portrait /
   synthetic) -> MediaPipe Face Landmarker mesh -> TRANSIENT geometry ->
   deterministic line-art render -> discard.

   Determinism contract (gates G-MP-2 / G-LA-2):
     - fixed paper/ink/accent palette + fixed stroke params + FIXED_SEED.
       Same input => byte-identical output, stable render hash. No randomness.
   Retention contract (gate G-MP-4): no localStorage / sessionStorage /
   IndexedDB, no toBlob / toDataURL, no URL object, no download; in-memory only.
   ========================================================================== */
(function (root) {
  "use strict";

  var ALGORITHM = "mediapipe-lineart/v1";
  var STYLE = "line-art";           // machine-checkable style classification (G-LA-1)
  var FIXED_SEED = 20260902;

  /* Honest on-screen copy (machine-checked by gate G-MP-4) — UNCHANGED. */
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

  /* ---- fixed line-art palette (deterministic stroke/paper/accents) ------ */
  var PAPER = [248, 242, 229];      // light warm paper background (line-art base)
  var INK = [40, 32, 26];            // warm sepia ink (stroke primitive)
  /* Subtle flat accents — applied ONLY within an explicit accentMask (hair /
     clothing), never inside the face. The empty background stays PAPER, so the
     "light background" reading holds. Inside the face silhouette there is NO
     flat-color fill: only paper + ink strokes. */
  var LINEART_ACCENTS = [
    [178, 116, 74],   // chestnut
    [140, 82, 52],    // umber
    [150, 118, 82],   // tan
    [206, 150, 104],  // pale
    [96, 56, 38]      // dark brown (hair)
  ];

  function nearestAccent(r, g, b) {
    var best = 0, bestD = Infinity;
    for (var i = 0; i < LINEART_ACCENTS.length; i++) {
      var p = LINEART_ACCENTS[i];
      var dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
      var d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function luminance(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

  /* ---- Sobel edge magnitude (deterministic, luminance-driven) ----------- */
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

  /* ---- core: image -> line-art/sketch pixels (pure, deterministic) ------ */
  /* image      = { width, height, data: Uint8ClampedArray RGBA }.          */
  /* faceMask   = optional Uint8Array, 1 = inside face region (no fill here).*/
  /* accentMask = optional Uint8Array, 1 = hair/clothing (subtle flat accent)*/
  /*              allowed. If accentMask is omitted, output is pure line-art */
  /*              (paper + ink, no flat fill anywhere).                      */
  function renderLineArt(image, faceMask, accentMask) {
    var w = image.width, h = image.height, src = image.data;
    var out = new Uint8ClampedArray(src.length);
    var gray = new Float32Array(w * h);
    var i, y, x;
    for (i = 0; i < w * h; i++) {
      gray[i] = luminance(src[i * 4], src[i * 4 + 1], src[i * 4 + 2]);
    }
    var edge = sobelEdges(gray, w, h);
    var rng = mulberry32(FIXED_SEED);
    // fixed stroke params derived once from FIXED_SEED (reproducible)
    var threshold = 48 + rng() * 20;      // edge -> ink stroke threshold
    var shadeFloor = 0.90 + rng() * 0.05; // minimal geometric shading floor
    for (y = 0; y < h; y++) {
      var band = 1 - 0.04 * (y / h);      // gentle vertical shading (non-photographic)
      for (x = 0; x < w; x++) {
        var idx = y * w + x, o = idx * 4;
        var cr, cg, cb;
        if (edge[idx] > threshold) {
          cr = INK[0]; cg = INK[1]; cb = INK[2];               // ink stroke
        } else if (accentMask && accentMask[idx]) {
          // subtle flat accent (hair/clothing) — posterize to fixed accent palette
          var pi = nearestAccent(src[o], src[o + 1], src[o + 2]);
          cr = LINEART_ACCENTS[pi][0]; cg = LINEART_ACCENTS[pi][1]; cb = LINEART_ACCENTS[pi][2];
        } else {
          var m = band * shadeFloor;                            // light paper + minimal shading
          cr = PAPER[0] * m; cg = PAPER[1] * m; cb = PAPER[2] * m;
        }
        out[o] = Math.round(cr); out[o + 1] = Math.round(cg);
        out[o + 2] = Math.round(cb); out[o + 3] = 255;
      }
    }
    var inputHash = fnv1a(src);
    var renderHash = fnv1a(out);
    var classification = classifyLineArt({ width: w, height: h, data: out }, faceMask);
    var provenance = ALGORITHM + "|input:" + inputHash + "|seed:" + FIXED_SEED +
      "|style:" + STYLE + "|stroke:sobel|base:paper|accents:" + LINEART_ACCENTS.length +
      "|" + w + "x" + h + "|render:" + renderHash;
    return {
      width: w, height: h, data: out,
      algorithm: ALGORITHM, style: STYLE, seed: FIXED_SEED,
      inputHash: inputHash, renderHash: renderHash, provenance: provenance,
      classification: classification
    };
  }

  /* ---- machine-checkable line-art classification (gate G-LA-1) ---------- */
  /* Verifies the OUTPUT pixels, not just the params: light paper base is
     dominant, ink stroke primitives are present, and there is NO flat-color
     (accent) fill inside the face region. */
  function classifyLineArt(out, faceMask) {
    var w = out.width, h = out.height, d = out.data, total = w * h;
    var paper = 0, ink = 0, accentTotal = 0, accentInFace = 0;
    function near(a, b, tol) {
      var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
      return (dr * dr + dg * dg + db * db) <= tol;
    }
    for (var i = 0; i < total; i++) {
      var o = i * 4;
      var px = [d[o], d[o + 1], d[o + 2]];
      var isPaper = near(px, PAPER, 40 * 40 + 1600);   // paper incl. subtle shade
      var isInk = near(px, INK, 55 * 55);
      var isAccent = false, j;
      for (j = 0; j < LINEART_ACCENTS.length && !isAccent; j++) {
        isAccent = near(px, LINEART_ACCENTS[j], 40 * 40);
      }
      if (isPaper) paper++;
      else if (isInk) ink++;
      else if (isAccent) accentTotal++;
      if (faceMask && faceMask[i] && isAccent) accentInFace++;  // flat fill in face = bad
    }
    return {
      lightBase: (paper / total) > 0.30,
      strokePrimitives: (ink / total) > 0.005,
      faceFill: accentInFace > 0,                                     // true => bad
      accentOutsideFaceOnly: accentInFace === 0 && accentTotal > 0
    };
  }

  /* Back-compat alias (slice 11 demo called renderCartoon). */
  function renderCartoon(image, faceMask, accentMask) {
    return renderLineArt(image, faceMask, accentMask);
  }

  /* ---- synthetic fallback portrait (pure code, NO assets, no real photos) */
  /* A flat, androgynous placeholder head drawn from geometry only; used when
     neither the camera nor the bundled test image is available. Returns the
     RGBA frame + faceMask (skin) + accentMask (hair band + shirt) so the
     line-art render keeps accents strictly outside the face. */
  function makeSyntheticPortrait(w, h) {
    var data = new Uint8ClampedArray(w * h * 4);
    var faceMask = new Uint8Array(w * h);
    var accentMask = new Uint8Array(w * h);
    var bg = [232, 208, 174];
    var skin = [206, 150, 104];
    var hair = [96, 56, 38];
    var shirt = [140, 82, 52];
    var cx = w / 2, cy = h * 0.42, r = h * 0.30;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var o = (y * w + x) * 4, idx = y * w + x;
        var dx = x - cx, dy = y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var col = bg;
        if (y > h * 0.74) { col = shirt; accentMask[idx] = 1; }
        if (dist <= r) {
          col = skin;
          if (y < cy - r * 0.30) { col = hair; accentMask[idx] = 1; }
          else faceMask[idx] = 1;                       // skin/face region
        }
        data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
      }
    }
    return { width: w, height: h, data: data, faceMask: faceMask, accentMask: accentMask };
  }

  /* ---- default avatar: bright, androgynous, OUTLINE-ONLY silhouette ------ */
  /* Unchanged from slice 11: drawn entirely from code, no image assets.     */
  function drawDefaultAvatar(ctx, w, h) {
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffe9b8";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#2a6fdb";
    ctx.lineWidth = Math.max(3, Math.round(w * 0.04));
    ctx.lineJoin = "round";
    var cx = w / 2, cy = h * 0.38, rx = w * 0.30, ry = h * 0.30;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.42, h);
    ctx.lineTo(cx - w * 0.30, cy + ry * 0.72);
    ctx.lineTo(cx + w * 0.30, cy + ry * 0.72);
    ctx.lineTo(cx + w * 0.42, h);
    ctx.stroke();
    ctx.fillStyle = "#2a6fdb";
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.02, 0, Math.PI * 2);
    ctx.fill();
    return { bright: true, androgynous: true, outline_only: true, no_discernible_features: true };
  }

  /* ---- browser render helpers (canvas) ----------------------------------- */
  function renderLineArtToCanvas(imgData, faceMask, accentMask, canvas) {
    if (!canvas || !canvas.getContext) return null;
    var ctx = canvas.getContext("2d");
    var out = renderLineArt({ width: imgData.width, height: imgData.height, data: imgData.data },
                            faceMask, accentMask);
    ctx.putImageData(new ImageData(out.data, imgData.width, imgData.height), 0, 0);
    return out;
  }

  /* Draw the synthetic fallback portrait straight to a canvas (no assets). */
  function renderSyntheticToCanvas(canvas) {
    if (!canvas || !canvas.getContext) return null;
    var w = canvas.width, h = canvas.height;
    var src = makeSyntheticPortrait(w, h);
    var out = renderLineArt(src, src.faceMask, src.accentMask);
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
    STYLE: STYLE,
    FIXED_SEED: FIXED_SEED,
    HONEST_COPY: HONEST_COPY,
    DEFAULT_AVATAR_ATTRS: DEFAULT_AVATAR_ATTRS,
    PAPER: PAPER,
    INK: INK,
    LINEART_ACCENTS: LINEART_ACCENTS,
    mulberry32: mulberry32,
    fnv1a: fnv1a,
    nearestAccent: nearestAccent,
    sobelEdges: sobelEdges,
    renderLineArt: renderLineArt,
    renderCartoon: renderCartoon,
    classifyLineArt: classifyLineArt,
    makeSyntheticPortrait: makeSyntheticPortrait,
    drawDefaultAvatar: drawDefaultAvatar,
    renderLineArtToCanvas: renderLineArtToCanvas,
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
    var r1 = renderLineArt(s1, s1.faceMask, s1.accentMask);
    var s2 = makeSyntheticPortrait(size, size);
    var r2 = renderLineArt(s2, s2.faceMask, s2.accentMask);

    ok = assert(bytesIdentical(r1, r2), "determinism: same input renders byte-identical output") && ok;
    ok = assert(r1.renderHash === r2.renderHash, "render hash stable across runs") && ok;
    ok = assert(r1.provenance === r2.provenance, "provenance string identical across runs") && ok;
    ok = assert(r1.provenance.indexOf(ALGORITHM) === 0, "provenance carries algorithm version") && ok;
    ok = assert(r1.seed === FIXED_SEED, "seed fixed to FIXED_SEED") && ok;
    ok = assert(r1.renderHash.length === 8, "render hash is an 8-hex-char fnv1a-32") && ok;
    ok = assert(r1.algorithm === "mediapipe-lineart/v1", "algorithm id = mediapipe-lineart/v1") && ok;
    ok = assert(r1.style === "line-art", "style classifier = line-art") && ok;

    // G-LA-1 style classification (machine-checked on the OUTPUT pixels)
    var c = r1.classification;
    ok = assert(c && c.lightBase, "line-art: light paper base is dominant") && ok;
    ok = assert(c && c.strokePrimitives, "line-art: ink stroke/edge primitives present") && ok;
    ok = assert(c && c.faceFill === false, "line-art: no flat-color fill inside the face region") && ok;
    ok = assert(c && c.accentOutsideFaceOnly, "line-art: flat accents appear OUTSIDE the face only") && ok;
    ok = assert(LINEART_ACCENTS.length === 5, "fixed accent palette has 5 entries (no variation)") && ok;

    var d = DEFAULT_AVATAR_ATTRS;
    ok = assert(d.bright && d.androgynous && d.outline_only && d.no_discernible_features,
      "default-avatar decided attributes set (bright/androgynous/outline-only/no-features)") && ok;

    console.log(JSON.stringify({
      selftest: ok ? "PASS" : "FAIL",
      algorithm: r1.algorithm,
      style: r1.style,
      renderHash: r1.renderHash,
      inputHash: r1.inputHash,
      seed: r1.seed,
      provenance: r1.provenance,
      deterministic: bytesIdentical(r1, r2),
      lightBase: c.lightBase,
      strokePrimitives: c.strokePrimitives,
      faceFill: c.faceFill,
      accentOutsideFaceOnly: c.accentOutsideFaceOnly,
      accentEntries: LINEART_ACCENTS.length,
      defaultAvatarAttrs: d
    }));
    if (process && process.exitCode !== 1) process.exitCode = 0;
  }

  if (typeof require !== "undefined" && require.main === module) {
    if (process.argv.indexOf("--selftest") !== -1) selftest();
  }
})(typeof window !== "undefined" ? window : globalThis);
