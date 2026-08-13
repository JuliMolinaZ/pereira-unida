"use client";

import dynamic from "next/dynamic";
import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { createClosedRoad, type ActionResult } from "@/app/actions";
import { cn } from "@/lib/utils";
import {
  CLOSED_ROAD_REASON_LABELS,
  CLOSED_ROAD_REASONS,
  MUNICIPALITIES,
  type ClosedRoad,
  type ClosedRoadReason,
  type Municipality,
  type RoadPoint,
} from "@/lib/types";

const RoadDrawMap = dynamic(() => import("./RoadDrawMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 items-center justify-center rounded-2xl bg-[#0e0e10] text-xs text-white/70">
      Cargando mapa
    </div>
  ),
});

interface ClosedRoadModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (road: ClosedRoad) => void;
}

const initialState: ActionResult<ClosedRoad> = { success: false };
const FIELD_CLASS =
  "w-full rounded-2xl bg-black/5 px-4 py-3.5 text-base text-ink outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-carmine/30 dark:bg-white/10";
const LABEL_CLASS = "mb-1.5 block text-[13px] font-medium text-ink-soft";

export default function ClosedRoadModal({ open, onClose, onCreated }: ClosedRoadModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [reason, setReason] = useState<ClosedRoadReason>("derrumbe");
  const [municipality, setMunicipality] = useState<Municipality>("Pereira");
  const [path, setPath] = useState<RoadPoint[]>([]);

  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult<ClosedRoad>, formData: FormData) => {
      formData.set("name", name);
      formData.set("reason", reason);
      formData.set("municipality", municipality);
      formData.set("path", JSON.stringify(path));
      const result = await createClosedRoad(formData);
      if (result.success && result.data) {
        onCreated(result.data);
        dialogRef.current?.close();
      }
      return result;
    },
    initialState
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();

    function handleClose() {
      setName("");
      setReason("derrumbe");
      setPath([]);
      onClose();
    }
    function handleBackdropClick(e: MouseEvent) {
      if (e.target === dialog) dialogRef.current?.close();
    }
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleBackdropClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="closed-road-title"
      className="glass m-0 mt-auto w-full max-w-lg rounded-t-[28px] p-0 text-ink sm:m-auto sm:rounded-[28px]"
    >
      <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-black/20 dark:bg-white/25" />
      <div className="flex items-center justify-between px-4 pt-2 pb-2">
        <h2 id="closed-road-title" className="text-[17px] font-semibold text-ink">
          Calle no transitable
        </h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Cerrar"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-ink-soft dark:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form
        action={formAction}
        className="max-h-[min(82dvh,760px)] space-y-4 overflow-y-auto px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        <div>
          <label htmlFor="road-name" className={LABEL_CLASS}>
            ¿Qué calle o tramo?
          </label>
          <input
            id="road-name"
            name="name"
            type="text"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Carrera 9 entre 24 y 26"
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <span className={LABEL_CLASS}>¿Por qué no se puede pasar?</span>
          <div className="grid grid-cols-2 gap-1.5">
            {CLOSED_ROAD_REASONS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setReason(key)}
                aria-pressed={reason === key}
                className={cn(
                  "min-h-11 rounded-2xl px-2 py-2 text-center text-[12px] font-medium transition",
                  reason === key ? "bg-carmine/90 text-white" : "bg-black/5 text-ink dark:bg-white/10"
                )}
              >
                {CLOSED_ROAD_REASON_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={LABEL_CLASS}>Dibuja el tramo cerrado</span>
          <RoadDrawMap path={path} onChange={setPath} />
        </div>

        <div className="flex items-center gap-1 rounded-full bg-black/5 p-1 dark:bg-white/10">
          {MUNICIPALITIES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMunicipality(m)}
              aria-pressed={municipality === m}
              className={cn(
                "flex-1 rounded-full py-1.5 text-[13px] font-medium transition",
                municipality === m ? "bg-ink text-paper shadow-sm" : "text-ink-soft"
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="road-note" className={LABEL_CLASS}>
            Detalle (opcional)
          </label>
          <input
            id="road-note"
            name="note"
            type="text"
            maxLength={200}
            placeholder="Ej: solo un carril, hay maquinaria"
            className={FIELD_CLASS}
          />
        </div>

        {state.error ? (
          <p className="text-[13px] font-medium text-carmine">{state.error}</p>
        ) : null}

        <button
          type="submit"
          disabled={isPending || path.length < 2}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-carmine text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Publicar vía cerrada
        </button>
      </form>
    </dialog>
  );
}
