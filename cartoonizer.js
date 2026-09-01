/* ============================================================================
   PARTNER-002 — UI prototype (slice 10) — on-device cartoon avatar pipeline
   ----------------------------------------------------------------------------
   Pure vanilla JS + HTML5 canvas. No external libraries, no CDN, no fetch /
   XMLHttpRequest / WebSocket, no network, no storage of the source image.

   What it does (owner decision 2026-08-31, "no real photos ever"):

     1. Reads an image source ON-DEVICE only:
        - synthetic demo avatars generated in-code (makeDemoAvatar), and/or
        - a local file picked via <input type="file"> + FileReader. The image
          never leaves the device: no upload, no network, the source is never
          stored — only the stylized cartoon pixels are produced in memory.
     2. Produces a stylized cartoon rendering:
        - color quantization / posterization (reduced palette),
        - edge detection (Sobel convolution) drawn as a dark edge overlay,
        - simplified shading (deterministic vertical band).
        Deterministic + SEEDED: same input + same seed => same output bytes.
     3. Algorithm-signed provenance: every output carries a provenance stamp
        (algorithm version + input-image hash + seed), readable in the UI.
        The input hash is FNV-1a 32-bit — a NON-cryptographic fingerprint,
        prototype-level, not a security commitment (noted in the verification
        record). A stylized likeness is NOT identification and NOT biometric.

   This module has no DOM dependency in its core (makeDemoAvatar / cartoonize /
   fnv1a / mulberry32 run under Node), so the gate self-test
   (`node cartoonizer.js --selftest`) proves determinism + provenance without a
   browser. The canvas render helpers are browser-only and guarded.
   ========================================================================== */
(function (root) {
  "use strict";

  var ALGORITHM = "cartoonizer/v1";

  /* ---- deterministic PRNG (mulberry32) — seeded reproducibility --------- */
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

  /* ---- posterize one channel to a reduced palette (levels buckets) ----- */
  var POSTER_LEVELS = 4;
  function posterize(v) {
    var step = 255 / (POSTER_LEVELS - 1);
    return Math.round(Math.round(v / step) * step);
  }

  /* ---- Sobel edge magnitude on luminance (deterministic) ---------------- */
  function luminance(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

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

  /* ---- core: image -> cartoon pixels (pure, deterministic, seeded) ------ */
  /* image  = { width, height, data: Uint8ClampedArray RGBA }               */
  function cartoonize(image, seed) {
    var w = image.width, h = image.height, src = image.data;
    var out = new Uint8ClampedArray(src.length);
    var gray = new Float32Array(w * h);
    var i, y, x;
    for (i = 0; i < w * h; i++) {
      gray[i] = luminance(src[i * 4], src[i * 4 + 1], src[i * 4 + 2]);
    }
    var edge = sobelEdges(gray, w, h);
    var rng = mulberry32(seed >>> 0);
    var threshold = 90 + rng() * 25; // seeded edge threshold (deterministic)
    for (y = 0; y < h; y++) {
      var shade = 1.0 - 0.14 * (y / h); // simplified shading band
      for (x = 0; x < w; x++) {
        var idx = y * w + x, o = idx * 4;
        var cr = posterize(src[o]), cg = posterize(src[o + 1]), cb = posterize(src[o + 2]);
        var mult = edge[idx] > threshold ? 0.22 : shade; // dark edge overlay
        out[o] = Math.round(cr * mult);
        out[o + 1] = Math.round(cg * mult);
        out[o + 2] = Math.round(cb * mult);
        out[o + 3] = 255;
      }
    }
    var inputHash = fnv1a(src);
    var provenance = ALGORITHM + "|input:" + inputHash + "|seed:" + seed + "|" + w + "x" + h;
    return {
      width: w, height: h, data: out,
      algorithm: ALGORITHM, inputHash: inputHash, seed: seed, provenance: provenance
    };
  }

  /* ---- synthetic demo avatar generator (in-code, no files, no images) -- */
  /* Produces a stylized head + shoulders avatar deterministically from a
     seed. Used for the candidate-card happy path and for the Node selftest. */
  function pickHair(rng) {
    var choices = [
      [40, 32, 26],    // dark brown
      [16, 14, 12],    // near-black
      [150, 120, 78],  // light blonde
      [95, 58, 36]     // auburn
    ];
    return choices[Math.floor(rng() * choices.length) % choices.length];
  }

  function makeDemoAvatar(w, h, seed) {
    var rng = mulberry32(seed >>> 0);
    var data = new Uint8ClampedArray(w * h * 4);
    var skin = [205 + Math.floor(rng() * 28), 158 + Math.floor(rng() * 28), 122 + Math.floor(rng() * 30)];
    var hair = pickHair(rng);
    var shirt = [70 + Math.floor(rng() * 110), 95 + Math.floor(rng() * 110), 120 + Math.floor(rng() * 110)];
    var bg = [236 + Math.floor(rng() * 16), 240 + Math.floor(rng() * 12), 232 + Math.floor(rng() * 18)];
    var cx = w / 2, cy = h * 0.40, r = h * 0.30;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var o = (y * w + x) * 4;
        var dx = x - cx, dy = y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var col = bg;
        if (y > h * 0.72) {
          col = shirt;                                   // shoulders
        } else if (y > h * 0.68) {
          col = (Math.abs(dx) < w * 0.10) ? skin : shirt; // neck vs shoulders
        }
        if (dist <= r) {                                  // head
          col = skin;
          if (y < cy - r * 0.30) col = hair;              // hair top
          var eyeY = cy + r * 0.02;
          if (Math.abs(y - eyeY) < r * 0.12) {
            if (Math.abs(x - (cx - r * 0.36)) < r * 0.08) col = [30, 30, 32];
            if (Math.abs(x - (cx + r * 0.36)) < r * 0.08) col = [30, 30, 32];
          }
          var my = cy + r * 0.42;
          if (y > my && y < my + r * 0.10 && Math.abs(dx) < r * 0.24) col = [172, 82, 82]; // mouth
        }
        data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
      }
    }
    return { width: w, height: h, data: data };
  }

  /* ---- browser-only canvas helpers (guarded; not used under Node) ------ */
  function renderDemoAvatar(seed, canvas) {
    if (!canvas || !canvas.getContext) return null;
    var w = canvas.width, h = canvas.height;
    var src = makeDemoAvatar(w, h, seed);
    var out = cartoonize(src, seed);
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.putImageData(new ImageData(out.data, w, h), 0, 0);
    return out.provenance;
  }

  function renderToCanvas(img, seed, canvas) {
    if (!canvas || !canvas.getContext) return null;
    var w = canvas.width, h = canvas.height;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    var id = ctx.getImageData(0, 0, w, h);
    var out = cartoonize({ width: w, height: h, data: id.data }, seed);
    ctx.putImageData(new ImageData(out.data, w, h), 0, 0);
    return { provenance: out.provenance, inputHash: out.inputHash, algorithm: out.algorithm };
  }

  /* Read a local file via FileReader and cartoonize it ON-DEVICE. The file
     bytes are never uploaded and never stored; only the stylized cartoon is
     drawn into `canvas`. No fetch / XMLHttpRequest / network anywhere. */
  function cartoonizeFile(file, seed, canvas, onDone) {
    if (!file || !(typeof FileReader !== "undefined")) {
      if (onDone) onDone({ error: "no file or FileReader unavailable" });
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        try {
          var out = renderToCanvas(img, seed, canvas);
          if (onDone) onDone({ provenance: out.provenance, inputHash: out.inputHash, algorithm: out.algorithm });
        } catch (e) {
          if (onDone) onDone({ error: "could not process image" });
        }
      };
      img.onerror = function () { if (onDone) onDone({ error: "could not load image" }); };
      img.src = reader.result;
    };
    reader.onerror = function () { if (onDone) onDone({ error: "could not read file" }); };
    reader.readAsDataURL(file);
  }

  /* ---- public API ------------------------------------------------------- */
  var api = {
    ALGORITHM: ALGORITHM,
    mulberry32: mulberry32,
    fnv1a: fnv1a,
    posterize: posterize,
    cartoonize: cartoonize,
    makeDemoAvatar: makeDemoAvatar,
    renderDemoAvatar: renderDemoAvatar,
    renderToCanvas: renderToCanvas,
    cartoonizeFile: cartoonizeFile
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Cartoonizer = api;
  }

  /* ---- self-test (run: node cartoonizer.js --selftest) ------------------ */
  function assert(cond, msg) {
    if (!cond) { console.error("CART SELFTEST FAIL: " + msg); process.exitCode = 1; return false; }
    return true;
  }

  function bytesIdentical(a, b) {
    if (!a || !b) return false;
    if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return false;
    for (var i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
    return true;
  }

  function selftest() {
    var ok = true;
    var seed = 65, size = 48;
    var src1 = makeDemoAvatar(size, size, seed);
    var c1 = cartoonize(src1, seed);
    var src2 = makeDemoAvatar(size, size, seed);
    var c2 = cartoonize(src2, seed);

    ok = assert(bytesIdentical(c1, c2), "determinism: same seeded input renders byte-identical output") && ok;
    ok = assert(c1.provenance === c2.provenance, "provenance string identical across runs") && ok;
    ok = assert(c1.provenance.indexOf("cartoonizer/v1") === 0, "provenance carries algorithm version") && ok;
    ok = assert(c1.provenance.indexOf("input:" + c1.inputHash) !== -1, "provenance carries input hash") && ok;
    ok = assert(c1.provenance.indexOf("seed:" + seed) !== -1, "provenance carries seed") && ok;
    ok = assert(c1.inputHash.length === 8 && c1.inputHash === fnv1a(src1.data), "input hash = fnv1a-32 (8 hex chars)") && ok;

    var c3 = cartoonize(makeDemoAvatar(size, size, 66), 66);
    ok = assert(!bytesIdentical(c1, c3), "different seed/avatar renders a different output") && ok;

    var c4 = cartoonize(src1, 99); // same source image, different pipeline seed
    ok = assert(c4.inputHash === c1.inputHash, "same source -> same input hash regardless of seed") && ok;
    ok = assert(!bytesIdentical(c1, c4), "same source, different seed -> different stylized render") && ok;

    console.log(JSON.stringify({
      selftest: ok ? "PASS" : "FAIL",
      algorithm: c1.algorithm,
      inputHash: c1.inputHash,
      provenance: c1.provenance,
      outBytes: c1.width * c1.height * 4,
      deterministic: bytesIdentical(c1, c2),
      distinct_seed: !bytesIdentical(c1, c3),
      same_input_diff_seed: c4.inputHash === c1.inputHash
    }));
    if (process && process.exitCode !== 1) process.exitCode = 0;
  }

  if (typeof require !== "undefined" && require.main === module) {
    if (process.argv.indexOf("--selftest") !== -1) selftest();
  }
})(typeof window !== "undefined" ? window : globalThis);
