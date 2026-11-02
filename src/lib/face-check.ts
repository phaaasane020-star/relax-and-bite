// Browser-only: checks a passport photo before it's sent, right on the phone.
// Uses Google's free MediaPipe face detector (about 250 KB model plus the
// engine), loaded only when someone picks a photo. Nothing leaves the phone
// for this check. If the detector can't load (no internet, old phone), the
// photo is accepted as before and our team checks it when approving.

const VERSION = '0.10.14';
const LIB = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

type Box = { originX: number; originY: number; width: number; height: number };
type Detector = { detect: (image: HTMLCanvasElement) => { detections: { boundingBox?: Box; categories?: { score: number }[] }[] } };

export type FaceResult =
  | { ok: true; warning?: string }
  | { ok: false; message: string };

let loading: Promise<Detector | null> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** Starts loading the detector (call early, for example when the form opens). */
export function preloadFaceDetector(): Promise<Detector | null> {
  loading ??= withTimeout(
    (async () => {
      try {
        const vision = await import(/* @vite-ignore */ `${LIB}/vision_bundle.mjs`);
        const files = await vision.FilesetResolver.forVisionTasks(`${LIB}/wasm`);
        return (await vision.FaceDetector.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.5,
        })) as Detector;
      } catch {
        return null;
      }
    })(),
    15000,
  ).then((d) => d ?? null);
  return loading;
}

/** Average brightness (0-255) and sharpness of part of the picture. */
function lightAndSharpness(canvas: HTMLCanvasElement, box: Box): { light: number; sharp: number } {
  const w = 128;
  const h = Math.max(16, Math.round((box.height / Math.max(1, box.width)) * w));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, box.originX, box.originY, box.width, box.height, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const grey = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const g = 0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!;
    grey[i] = g;
    sum += g;
  }
  // Sharpness: how much the edges stand out (variance of the Laplacian)
  let n = 0;
  let mean = 0;
  let sq = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = grey[i - w]! + grey[i + w]! + grey[i - 1]! + grey[i + 1]! - 4 * grey[i]!;
      n++;
      const d = lap - mean;
      mean += d / n;
      sq += d * (lap - mean);
    }
  }
  return { light: sum / (w * h), sharp: n > 1 ? sq / (n - 1) : 0 };
}

/**
 * null: the check couldn't run (photo is accepted, our team looks at it).
 * Otherwise ok, ok with a warning (dark or blurry), or not ok with the reason.
 */
export async function checkPassportPhoto(canvas: HTMLCanvasElement): Promise<FaceResult | null> {
  const detector = await preloadFaceDetector();
  if (!detector) return null;
  let faces: Box[];
  try {
    faces = detector
      .detect(canvas)
      .detections.filter((d) => (d.categories?.[0]?.score ?? 1) >= 0.5 && d.boundingBox)
      .map((d) => d.boundingBox!);
  } catch {
    return null;
  }
  if (faces.length === 0) {
    return { ok: false, message: "We can't see a face in this photo. Face the camera in good light and try again." };
  }
  if (faces.length > 1) {
    return { ok: false, message: 'Only you should be in the photo. Take one with just your face.' };
  }
  const face = faces[0]!;
  const W = canvas.width;
  const H = canvas.height;
  if (face.width < W * 0.22) {
    return { ok: false, message: 'Your face is too small. Hold the phone closer so your face fills more of the photo.' };
  }
  const cx = (face.originX + face.width / 2) / W;
  const cy = (face.originY + face.height / 2) / H;
  if (cx < 0.2 || cx > 0.8 || cy < 0.15 || cy > 0.85) {
    return { ok: false, message: 'Put your face in the middle of the photo and try again.' };
  }
  const { light, sharp } = lightAndSharpness(canvas, face);
  if (light < 55) return { ok: true, warning: 'The photo is quite dark. A brighter one helps our team check it faster.' };
  if (light > 230) return { ok: true, warning: 'The photo is very bright. Try one without strong light behind or on you.' };
  if (sharp < 25) return { ok: true, warning: 'The photo looks blurry. Hold the phone still and try again if you can.' };
  return { ok: true };
}
