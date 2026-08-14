"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { createHelpOffer, type ActionResult } from "@/app/actions";
import { cn } from "@/lib/utils";
import {
  HELP_SKILL_EMOJI,
  HELP_SKILL_LABELS,
  HELP_SKILLS,
  type HelpOffer,
  type HelpSkill,
} from "@/lib/types";
import { cityById, DEFAULT_CITY_ID, municipalityForPin, type AppCity } from "@/lib/regions";
import CityBanner from "./CityBanner";

interface HelpOfferModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (offer: HelpOffer) => void;
  city?: AppCity;
  onChangeCity?: () => void;
}

const initialState: ActionResult<HelpOffer> = { success: false };
const FIELD_CLASS =
  "w-full rounded-2xl bg-black/5 px-4 py-3.5 text-base text-ink outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-forest/30 dark:bg-white/10";
const LABEL_CLASS = "mb-1.5 block text-[13px] font-medium text-ink-soft";

const SKILL_HINT: Record<HelpSkill, string> = {
  psicologia: "Ej: Atiendo duelo y crisis, de 8 a 8",
  medico: "Ej: Médico general, primeros auxilios",
  enfermeria: "Ej: Curaciones y toma de signos",
  rescate: "Ej: Búsqueda, cuerdas, primeros auxilios",
  ingenieria: "Ej: Reviso estructuras y riesgos",
  transporte: "Ej: Camioneta 4x4, motocarro",
  oficios: "Ej: Electricista, plomería, albañilería",
  legal: "Ej: Orientación en trámites y derechos",
  alimentacion: "Ej: Cocino o dono mercados",
  otro: "Ej: En qué puedes echar una mano",
};

export default function HelpOfferModal({
  open,
  onClose,
  onCreated,
  city = cityById(DEFAULT_CITY_ID),
  onChangeCity,
}: HelpOfferModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [fullName, setFullName] = useState("");
  const [skill, setSkill] = useState<HelpSkill>("psicologia");

  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult<HelpOffer>, formData: FormData) => {
      formData.set("full_name", fullName);
      formData.set("skill", skill);
      formData.set("municipality", municipalityForPin(city));
      formData.set("department", city.department);
      const result = await createHelpOffer(formData);
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
      setFullName("");
      setSkill("psicologia");
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
      aria-labelledby="help-offer-title"
      className="glass m-0 mt-auto w-full max-w-lg rounded-t-[28px] p-0 text-ink sm:m-auto sm:rounded-[28px]"
    >
      <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-black/20 dark:bg-white/25" />
      <div className="flex items-center justify-between px-4 pt-2 pb-2">
        <h2 id="help-offer-title" className="text-[17px] font-semibold text-ink">
          En qué puedo ayudar
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
        <CityBanner city={city} action="ofrecer" onChange={onChangeCity} />
        <p className="text-[13px] leading-snug text-ink-soft">
          Te ven las personas de {city.name}. Cuéntales en qué puedes ayudar.
        </p>

        <div>
          <label htmlFor="offer-name" className={LABEL_CLASS}>
            Tu nombre
          </label>
          <input
            id="offer-name"
            name="full_name"
            type="text"
            required
            maxLength={80}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ej: Ana María Restrepo"
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <span className={LABEL_CLASS}>¿En qué ayudas?</span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {HELP_SKILLS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSkill(key)}
                aria-pressed={skill === key}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center text-[12px] leading-tight font-medium transition",
                  skill === key
                    ? "bg-forest/90 text-white"
                    : "bg-black/5 text-ink dark:bg-white/10"
                )}
              >
                <span aria-hidden="true" className="shrink-0">
                  {HELP_SKILL_EMOJI[key]}
                </span>
                <span className="line-clamp-2 min-w-0">{HELP_SKILL_LABELS[key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="offer-description" className={LABEL_CLASS}>
            Detalle (opcional)
          </label>
          <textarea
            id="offer-description"
            name="description"
            maxLength={280}
            rows={3}
            placeholder={SKILL_HINT[skill]}
            className={cn(FIELD_CLASS, "resize-none")}
          />
        </div>

        <div>
          <label htmlFor="offer-phone" className={LABEL_CLASS}>
            WhatsApp / Teléfono
          </label>
          <input
            id="offer-phone"
            name="phone"
            type="tel"
            required
            inputMode="tel"
            placeholder="3001234567"
            className={FIELD_CLASS}
          />
        </div>

        {state.error ? (
          <p className="text-[13px] font-medium text-carmine" role="alert">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending || !fullName.trim()}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-forest text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Publicar mi ayuda
        </button>
      </form>
    </dialog>
  );
}
