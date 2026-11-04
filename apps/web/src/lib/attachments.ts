import { t } from '@/i18n';

/** Must match the server limit. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];
/** Value for `<input type="file" accept>` – any image (converted to JPEG when needed) or PDF. */
export const ACCEPT_ATTRIBUTE = 'image/*,application/pdf';

/** Photos larger than this are scaled down before uploading (longest side, in pixels). */
const MAX_DIMENSION = 2000;
/** Images above this size are re-encoded even when their dimensions are fine. */
const REENCODE_ABOVE = 1.5 * 1024 * 1024;

export interface UploadBlob {
  blob: Blob;
  name: string;
}

function named(blob: Blob, name: string): UploadBlob {
  return { blob, name };
}

/** "IMG_1234.HEIC" → "IMG_1234.jpg" */
export function withExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^./\\]{1,5}$/, '') || 'receipt';
  return `${base}.${ext}`;
}

async function decode(file: File): Promise<{ source: CanvasImageSource; w: number; h: number }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, w: bitmap.width, h: bitmap.height };
    } catch {
      // Fall back to an <img> element below (e.g. HEIC on older Safari).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Target size that keeps the aspect ratio and fits into `max` × `max`. */
export function fitWithin(w: number, h: number, max = MAX_DIMENSION): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/**
 * Prepares a picked file for upload: photos are scaled down and converted to JPEG (also HEIC and
 * other formats the browser can display), PDFs and small images are sent unchanged.
 */
export async function prepareUpload(file: File): Promise<UploadBlob> {
  const accepted = ACCEPTED_TYPES.includes(file.type);
  if (file.type === 'application/pdf' || file.type === 'image/gif') {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(t('The file is larger than 10 MB'));
    return named(file, file.name);
  }
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
    throw new Error(t('Only images (JPEG, PNG, WebP, GIF) and PDF files can be attached'));
  }

  let decoded: Awaited<ReturnType<typeof decode>>;
  try {
    decoded = await decode(file);
  } catch {
    if (accepted && file.size <= MAX_UPLOAD_BYTES) return named(file, file.name);
    throw new Error(t('This image could not be read'));
  }
  const target = fitWithin(decoded.w, decoded.h);
  const resize = target.w !== decoded.w || target.h !== decoded.h;
  if (accepted && !resize && file.size <= REENCODE_ABOVE) return named(file, file.name);

  const canvas = document.createElement('canvas');
  canvas.width = target.w;
  canvas.height = target.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return named(file, file.name);
  // Transparent areas (screenshots) would turn black in a JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, target.w, target.h);
  ctx.drawImage(decoded.source, 0, 0, target.w, target.h);
  if ('close' in decoded.source) (decoded.source as ImageBitmap).close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  );
  if (!blob) throw new Error(t('This image could not be read'));
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error(t('The file is larger than 10 MB'));
  return named(blob, withExtension(file.name, 'jpg'));
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function attachmentUrl(id: string, download = false): string {
  return `/api/attachments/${id}${download ? '?download=true' : ''}`;
}
