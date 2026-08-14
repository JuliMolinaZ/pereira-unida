"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Images, Loader2, X } from "lucide-react";
import { MAX_PHOTOS_PER_ENTRY, preparePhotoFile } from "@/lib/photos";

interface PhotoPickerProps {
  id: string;
  label: string;
  hint?: string;
  max?: number;
  onFilesChange?: (files: File[]) => void;
  onBusyChange?: (busy: boolean) => void;
}

export default function PhotoPicker({
  id,
  label,
  hint,
  max = MAX_PHOTOS_PER_ENTRY,
  onFilesChange,
  onBusyChange,
}: PhotoPickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<File[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  filesRef.current = files;

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  useEffect(() => {
    return () => onBusyChange?.(false);
    // Solo al desmontar el picker (cambio de key / cierre del modal).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addFiles(incoming: File[]) {
    if (incoming.length === 0) return;
    setLocalError(null);
    setPreparing(true);
    onBusyChange?.(true);
    try {
      const usable = incoming.filter((file) => file.size > 0);
      if (usable.length === 0) {
        setLocalError(
          "No se pudo leer esa foto. Tómalas de nuevo o elige otra de la galería."
        );
        return;
      }

      const room = max - filesRef.current.length;
      if (room <= 0) {
        setLocalError(`Puedes adjuntar máximo ${max} fotos.`);
        return;
      }

      const truncated = usable.length > room;
      const prepared: File[] = [];
      const errors: string[] = [];
      for (const file of usable.slice(0, room)) {
        const result = await preparePhotoFile(file);
        if (result.error) {
          errors.push(result.error);
          continue;
        }
        if (result.file) prepared.push(result.file);
      }

      if (prepared.length > 0) {
        const next = [...filesRef.current, ...prepared].slice(0, max);
        setFiles(next);
        onFilesChange?.(next);
      }

      if (errors.length > 0) {
        setLocalError(errors[0]);
      } else if (truncated) {
        setLocalError(`Solo se pueden adjuntar ${max} fotos.`);
      } else if (prepared.length === 0) {
        setLocalError("No se pudo agregar esa foto. Prueba tomarla de nuevo.");
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setLocalError(
        raw
          ? `No se pudo agregar esa foto: ${raw}`
          : "No se pudo agregar esa foto. Prueba con otra."
      );
    } finally {
      setPreparing(false);
      onBusyChange?.(false);
    }
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? []);
    e.target.value = "";
    void addFiles(incoming);
  }

  function removeAt(index: number) {
    const next = filesRef.current.filter((_, i) => i !== index);
    setFiles(next);
    onFilesChange?.(next);
    setLocalError(null);
  }

  const canAdd = files.length < max;
  const addLabel = files.length === 0;

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>

      <input
        ref={cameraRef}
        id={`${id}-camera`}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handlePick}
      />
      <input
        ref={galleryRef}
        id={`${id}-gallery`}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        multiple
        className="sr-only"
        onChange={handlePick}
      />

      <div className="flex flex-wrap items-center gap-2">
        {previews.map((url, index) => (
          <div key={`${url}-${index}`} className="relative h-16 w-16 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- preview local blob: */}
            <img src={url} alt="" className="h-16 w-16 rounded-2xl object-cover" />
            <button
              type="button"
              onClick={() => removeAt(index)}
              aria-label={`Quitar foto ${index + 1}`}
              className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-paper"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {canAdd ? (
          preparing ? (
            <div className="flex min-h-16 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-black/5 px-3 py-3 text-[13px] font-medium text-ink dark:bg-white/10">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
              Comprimiendo…
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex min-h-16 min-w-16 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-black/5 px-3 py-3 text-[13px] font-medium text-ink dark:bg-white/10"
              >
                <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
                {addLabel ? "Cámara" : "Otra foto"}
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="flex min-h-16 min-w-16 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-black/5 px-3 py-3 text-[13px] font-medium text-ink dark:bg-white/10"
              >
                <Images className="h-4 w-4 shrink-0" aria-hidden="true" />
                Galería
              </button>
            </>
          )
        ) : null}
      </div>
      {localError ? (
        <p className="mt-1.5 text-[12px] font-medium text-carmine" role="alert">
          {localError}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-ink-soft">
          {hint ?? `Hasta ${max} fotos. Se comprimen en el celular antes de enviar.`}
        </p>
      )}
    </div>
  );
}
