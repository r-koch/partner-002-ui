/* ============================================================================
   PARTNER-002 — UI prototype (slice 11) — MediaPipe Face Landmarker demo glue
   ----------------------------------------------------------------------------
   Browser-only ES module. It wires the VENDORED MediaPipe Tasks-Vision Face
   Landmarker (see ./vendor/mediapipe/ — Apache-2.0, no CDN, loaded from local
   bundled URIs only) to the deterministic re-render in avatar-render.js.

   Pipeline (on-device, transient):
     input (webcam frame OR bundled public-domain test portrait OR synthetic
     placeholder) -> Face Landmarker -> transient face mesh -> deterministic
     cartoon re-render (flat-color posterize + edge overlay, fixed warm
     palette/seed) -> canvas preview.

   Nothing is stored and nothing is exported: the raw frame and the mesh are
   held only in local variables and are dropped when the function returns.
   There is no localStorage / IndexedDB / blob-export / download anywhere here,
   and no network call of any kind (the MediaPipe wasm + model are static
   local assets fetched by MediaPipe's own resolver from relative URIs).
   ========================================================================== */

import { FilesetResolver, FaceLandmarker } from "./vendor/mediapipe/vision_bundle.mjs";

const WASM_ROOT = "vendor/mediapipe/wasm";
const MODEL_PATH = "vendor/mediapipe/face_landmarker.task";
const TEST_IMAGE_PATH = "vendor/test-input/neil-armstrong.jpg";

let landmarker = null;
let liveVideo = null;
let liveStream = null;

function el(id) { return document.getElementById(id); }
function setStatus(msg) {
  const s = el("mp-status");
  if (s) s.textContent = msg;
}

/* ---- build the landmarker once (local bundled model + wasm; CPU delegate) */
async function initLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
    runningMode: "IMAGE",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false
  });
}

/* ---- render one image source through the pipeline ------------------------ */
/* source = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement           */
async function renderFace(source, isVideo) {
  const preview = el("mp-preview");
  const staging = el("mp-staging");
  if (!preview || !staging || !landmarker) return;
  const ctx = staging.getContext("2d");
  const w = staging.width, h = staging.height;
  ctx.drawImage(source, 0, 0, w, h);

  // 1) transient raw frame (dropped at end of this function)
  const raw = ctx.getImageData(0, 0, w, h);

  // 2) transient face mesh from MediaPipe (no identity embedding is produced)
  let mesh = null;
  const result = isVideo
    ? landmarker.detectForVideo(source, performance.now())
    : landmarker.detect(source);
  if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
    mesh = result.faceLandmarks[0];
  }

  // 3) deterministic cartoon re-render (flat-color posterize + edge overlay)
  const AR = window.AvatarRender;
  const out = AR.renderCartoon({ width: w, height: h, data: raw.data });
  const pctx = preview.getContext("2d");
  pctx.putImageData(new ImageData(out.data, w, h), 0, 0);

  // 4) mesh-driven edge overlay (only if a face was found)
  if (mesh) {
    drawMesh(pctx, mesh, w, h);
    setStatus(AR.HONEST_COPY + " Signature: " + out.renderHash);
  } else {
    setStatus("No face detected \u2014 showing the stylized render without a mesh overlay.");
  }
  const prov = el("mp-provenance");
  if (prov) prov.textContent = out.provenance;
}

/* ---- draw the 478-point face mesh as a dark edge overlay ----------------- */
function drawMesh(ctx, landmarks, w, h) {
  const conns = FaceLandmarker.FACE_LANDMARKS_TESSELATION || [];
  ctx.strokeStyle = "#16110e";
  ctx.lineWidth = Math.max(1, Math.round(w / 400));
  ctx.beginPath();
  for (let i = 0; i < conns.length; i++) {
    const a = landmarks[conns[i].start], b = landmarks[conns[i].end];
    if (!a || !b) continue;
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
  }
  ctx.stroke();
}

/* ---- input paths: camera -> bundled test portrait -> synthetic ----------- */
async function tryCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  try {
    liveStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = el("mp-camera");
    if (!video) return false;
    video.srcObject = liveStream;
    await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = rej; });
    liveVideo = video;
    const startBtn = el("mp-render-camera");
    if (startBtn) { startBtn.hidden = false; }
    setStatus("Camera ready \u2014 the frame is processed on this device only.");
    return true;
  } catch (e) {
    setStatus("Camera unavailable \u2014 using the bundled public-domain test portrait.");
    return false;
  }
}

async function tryTestImage() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = TEST_IMAGE_PATH; // local bundled URI, no network
  });
}

function renderSyntheticFallback() {
  const AR = window.AvatarRender;
  const preview = el("mp-preview");
  if (!preview) return;
  AR.renderSyntheticToCanvas(preview);
  setStatus(AR.HONEST_COPY + " Synthetic placeholder input (no photo assets available).");
}

/* ---- boot ---------------------------------------------------------------- */
export async function boot() {
  try {
    await initLandmarker();
  } catch (e) {
    setStatus("MediaPipe wasm/model could not load \u2014 " +
      "showing the synthetic code-only fallback. (" + e.message + ")");
    renderSyntheticFallback();
    return;
  }

  const AR = window.AvatarRender;
  const honest = el("mp-honest");
  if (honest) honest.textContent = AR.HONEST_COPY;

  const cameraOk = await tryCamera();

  if (cameraOk && liveVideo) {
    // wired: the "Render a frame" button snaps one frame -> pipeline
    const btn = el("mp-render-camera");
    if (btn) btn.addEventListener("click", () => renderFace(liveVideo, true));
    await renderFace(liveVideo, true); // render one initial frame too
    return;
  }

  const img = await tryTestImage();
  if (img) {
    await renderFace(img, false);
    setStatus(AR.HONEST_COPY + " Input: bundled public-domain NASA test portrait.");
    return;
  }

  renderSyntheticFallback();
}

if (typeof window !== "undefined") {
  // This module is loaded after avatar-render.js, so AvatarRender is present.
  window.MediaPipeDemo = { boot: boot };
}
