export const PHOTO_BUCKET = "community-photos";
export const MAX_PHOTOS_PER_ENTRY = 3;
export const MAX_RENTAL_PHOTOS = 6;
/** Tope duro en el server (después de comprimir en el celular). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** Tope al elegir: un disparo de cámara puede irse a 8–15 MB. */
export const MAX_PHOTO_PICK_BYTES = 20 * 1024 * 1024;
/** Lado largo: HD. Suficiente en pantalla y liviano en 2G/3G. */
const PHOTO_MAX_EDGE = 1280;
/** Si el JPEG ya es chico y no es enorme, no lo recomprimimos. */
const SKIP_RECOMPRESS_BYTES = 350 * 1024;
const JPEG_QUALITIES = [0.72, 0.64, 0.55] as const;

const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
]);

export function isAllowedPhotoType(type: string): boolean {
  return ALLOWED_PHOTO_TYPES.has(type.toLowerCase());
}

export function normalizePhotoUrls(value: unknown, max = MAX_PHOTOS_PER_ENTRY): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((url): url is string => typeof url === "string" && /^https:\/\//.test(url))
    .slice(0, max);
}

/** FormData en Server Actions a veces no pasa `instanceof File`. */
export function isPhotoBlob(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    typeof (value as File).size === "number" &&
    (value as File).size > 0 &&
    typeof (value as File).arrayBuffer === "function"
  );
}

export function explainPhotoFailure(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("body exceeded") ||
    lower.includes("body size") ||
    lower.includes("payload too large") ||
    lower.includes("too large") ||
    lower.includes("functional_body") ||
    lower.includes("request entity") ||
    lower.includes("413") ||
    lower.includes("entity too large")
  ) {
    return "La foto es demasiado pesada para enviarla. Elige una de menor resolución o toma otra.";
  }
  if (
    lower.includes("unexpected response") ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("the server responded") ||
    lower.includes("server components render") ||
    lower.includes("omitted in production") ||
    lower.includes("an unexpected response")
  ) {
    return "No se pudo enviar la foto. Prueba con una más liviana, con menos fotos, o toma otra.";
  }
  if (
    lower.includes("spaces") ||
    lower.includes("accessdenied") ||
    lower.includes("invalidaccesskey") ||
    lower.includes("signature") ||
    lower.includes("s3")
  ) {
    return "No se pudo guardar la foto en el almacenamiento. Revisa las claves de DigitalOcean Spaces.";
  }
  if (
    lower.includes("bucket") ||
    lower.includes("not found") ||
    (lower.includes("does not exist") && lower.includes("storage"))
  ) {
    return "Falta configurar el almacenamiento de fotos (DigitalOcean Spaces o el bucket de Supabase).";
  }
  if (lower.includes("photo_urls") || lower.includes("schema cache")) {
    return "Falta aplicar schema.sql en el SQL Editor de Supabase (columna de fotos).";
  }
  if (
    lower.includes("row-level security") ||
    lower.includes("violates row-level") ||
    lower.includes("unauthorized") ||
    lower.includes("not allowed") ||
    lower.includes("new row violates")
  ) {
    return "El almacenamiento rechazó la foto. Revisa permisos del bucket o las claves de Spaces.";
  }
  if (lower.includes("mime") || lower.includes("invalid file")) {
    return "Ese formato de foto no está permitido. Usa JPEG, PNG o WebP.";
  }
  if (lower.includes("heic") || lower.includes("heif")) {
    return "No pudimos leer esa foto HEIC. En el iPhone: Ajustes → Cámara → Formatos → Más compatible.";
  }
  return raw;
}

function tooHeavyMessage(maxBytes: number): string {
  return `Cada foto debe pesar menos de ${maxBytes / (1024 * 1024)} MB. Toma otra o elige una de la galería.`;
}

function heicUnsupportedMessage(): string {
  return "No pudimos leer esa foto HEIC. En el iPhone: Ajustes → Cámara → Formatos → Más compatible, o elige una JPEG.";
}

function asJpegFile(blob: Blob, originalName: string): File {
  const base = originalName.replace(/\.[^.]+$/, "") || "foto";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function isJpegFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  return (
    type === "image/jpeg" ||
    type === "image/jpg" ||
    type === "image/pjpeg" ||
    /\.jpe?g$/i.test(file.name)
  );
}

function looksLikeHeic(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  return type.includes("heic") || type.includes("heif") || /\.hei[cf]$/i.test(file.name);
}

type DecodedPhoto = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  close: () => void;
};

async function decodeWithBitmap(file: File): Promise<DecodedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bitmap = await createImageBitmap(file);
  }
  return {
    width: bitmap.width,
    height: bitmap.height,
    draw(ctx, width, height) {
      ctx.drawImage(bitmap, 0, 0, width, height);
    },
    close() {
      bitmap.close();
    },
  };
}

async function decodeWithImg(file: File): Promise<DecodedPhoto> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("decode");
  }
  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    draw(ctx, width, height) {
      ctx.drawImage(img, 0, 0, width, height);
    },
    close() {
      URL.revokeObjectURL(url);
    },
  };
}

async function decodePhoto(file: File): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === "function") {
    try {
      return await decodeWithBitmap(file);
    } catch {
      /* Safari a veces decodifica HEIC en <img> y no en createImageBitmap. */
    }
  }
  return decodeWithImg(file);
}

function targetSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function paintPhoto(
  decoded: DecodedPhoto,
  width: number,
  height: number
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  decoded.draw(ctx, width, height);
  return canvas;
}

async function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  for (const quality of JPEG_QUALITIES) {
    const blob = await canvasToJpeg(canvas, quality);
    if (blob && blob.size <= MAX_PHOTO_BYTES) return blob;
  }
  return canvasToJpeg(canvas, JPEG_QUALITIES[JPEG_QUALITIES.length - 1]);
}

/**
 * Prepara una foto de celular: convierte HEIC, respeta la orientación EXIF y
 * baja a 1280 px / JPEG liviano para redes 2G/3G. Si el JPEG ya es chico,
 * se deja tal cual.
 */
export async function preparePhotoFile(
  file: File
): Promise<{ file?: File; error?: string }> {
  if (file.size === 0) {
    return { error: "No se pudo leer esa foto (archivo vacío). Tómalas de nuevo o elige otra." };
  }
  if (file.size > MAX_PHOTO_PICK_BYTES) {
    return { error: tooHeavyMessage(MAX_PHOTO_PICK_BYTES) };
  }

  const type = (file.type || "").toLowerCase();
  if (type && !isAllowedPhotoType(type) && !type.startsWith("image/")) {
    return { error: "Solo se permiten fotos (JPEG, PNG, WebP o HEIC)." };
  }

  const alreadyJpeg = isJpegFile(file);
  const heic = looksLikeHeic(file);

  let decoded: DecodedPhoto;
  try {
    decoded = await decodePhoto(file);
  } catch {
    if (heic) return { error: heicUnsupportedMessage() };
    if (alreadyJpeg && file.size <= MAX_PHOTO_BYTES) return { file };
    if (file.size > MAX_PHOTO_BYTES) return { error: tooHeavyMessage(MAX_PHOTO_BYTES) };
    return {
      error: "No pudimos leer esa foto. Prueba tomarla de nuevo o elige una JPEG.",
    };
  }

  try {
    if (
      alreadyJpeg &&
      file.size <= SKIP_RECOMPRESS_BYTES &&
      Math.max(decoded.width, decoded.height) <= PHOTO_MAX_EDGE + 64
    ) {
      return { file };
    }

    const { width, height } = targetSize(decoded.width, decoded.height);
    const canvas = paintPhoto(decoded, width, height);
    if (!canvas) {
      if (heic) return { error: heicUnsupportedMessage() };
      if (alreadyJpeg && file.size <= MAX_PHOTO_BYTES) return { file };
      return { error: "No pudimos preparar esa foto. Prueba con una JPEG." };
    }

    const blob = await encodeJpeg(canvas);
    if (!blob) {
      return { error: "No pudimos comprimir esa foto. Prueba tomarla de nuevo." };
    }
    if (blob.size > MAX_PHOTO_BYTES) {
      return {
        error: "La foto sigue siendo muy pesada después de comprimirla. Toma otra más simple.",
      };
    }
    if (alreadyJpeg && blob.size >= file.size && file.size <= MAX_PHOTO_BYTES) {
      return { file };
    }
    try {
      return { file: asJpegFile(blob, file.name) };
    } catch {
      return { error: "El navegador no pudo adjuntar esa foto. Prueba con otra." };
    }
  } finally {
    decoded.close();
  }
}
