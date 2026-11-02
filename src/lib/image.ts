// Browser-only: shrink a photo before upload so it's quick on mobile data.
import { checkPassportPhoto, preloadFaceDetector } from './face-check';

/** The chosen photo, shrunk so its longest side is at most maxSide. */
export async function photoToCanvas(file: File, maxSide: number): Promise<HTMLCanvasElement> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo (JPG or PNG).');
  if (file.size > 15 * 1024 * 1024) throw new Error('That photo is too large. Choose one under 15 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function photoToDataUrl(file: File, maxSide: number, quality = 0.82): Promise<string> {
  return (await photoToCanvas(file, maxSide)).toDataURL('image/jpeg', quality);
}

/**
 * Wire up every <input type="file" data-photo-for="hiddenInputName" data-max="800">:
 * resizes the chosen photo, puts it in the hidden input and shows a preview
 * in the element with data-photo-preview="hiddenInputName".
 * With data-face-check, the photo must show one clear face (checked on the
 * phone) before it's used; data-photo-note="name" shows tips and warnings.
 */
export function bindPhotoInputs(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement>('input[type="file"][data-photo-for]').forEach((input) => {
    const name = input.dataset.photoFor!;
    const hidden = root.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);
    const preview = root.querySelector<HTMLImageElement>(`img[data-photo-preview="${name}"]`);
    const error = root.querySelector<HTMLElement>(`[data-photo-error="${name}"]`);
    const note = root.querySelector<HTMLElement>(`[data-photo-note="${name}"]`);
    const faceCheck = input.hasAttribute('data-face-check');
    const say = (el: HTMLElement | null, text: string) => {
      if (!el) return;
      el.textContent = text;
      el.hidden = !text;
    };
    // Get the checker ready as soon as they're about to pick a photo
    if (faceCheck) input.closest('label')?.addEventListener('pointerdown', () => void preloadFaceDetector(), { once: true });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file || !hidden) return;
      say(error, '');
      say(note, '');
      try {
        const canvas = await photoToCanvas(file, Number(input.dataset.max || 800));
        if (faceCheck) {
          say(note, 'Checking your photo…');
          const result = await checkPassportPhoto(canvas);
          say(note, '');
          if (result && !result.ok) {
            input.value = '';
            say(error, result.message);
            return;
          }
          if (result?.ok && result.warning) say(note, result.warning);
          else if (result?.ok) say(note, 'Looks good.');
        }
        hidden.value = canvas.toDataURL('image/jpeg', 0.82);
        if (preview) {
          preview.src = hidden.value;
          preview.hidden = false;
          preview.nextElementSibling?.setAttribute('hidden', '');
        }
      } catch (e) {
        if (error) {
          error.textContent = (e as Error).message;
          error.hidden = false;
        }
      }
    });
  });
}
