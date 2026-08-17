"use client";

import { useState } from "react";
import { AtSign, MessageCircle, Wrench, X } from "lucide-react";
import {
  SUPPORT_INSTAGRAM_HANDLE,
  SUPPORT_INSTAGRAM_URL,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_URL,
} from "@/lib/support";
import { cn } from "@/lib/utils";

export default function SupportFab({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Soporte técnico"
        className="glass flex h-10 w-10 items-center justify-center rounded-full text-ink lg:h-11 lg:w-11"
      >
        <Wrench className="h-[18px] w-[18px] text-carmine" aria-hidden="true" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Cerrar soporte"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="dialog"
            aria-label="Contacto de soporte técnico"
            className="glass absolute right-full top-1/2 z-50 mr-2 w-[16.5rem] -translate-y-1/2 rounded-[22px] p-1.5"
          >
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <p className="text-[12px] font-medium text-ink/60">¿La app falló?</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="text-ink/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <a
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-2xl px-2.5 py-2.5 text-[15px] font-medium text-ink transition active:bg-ink/8"
            >
              <MessageCircle className="h-4 w-4 shrink-0 text-[#25D366]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                WhatsApp
                <span className="block text-[11px] font-medium text-ink-soft">
                  {SUPPORT_WHATSAPP_DISPLAY}
                </span>
              </span>
            </a>
            <a
              href={SUPPORT_INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-2xl px-2.5 py-2.5 text-[15px] font-medium text-ink transition active:bg-ink/8"
            >
              <AtSign className="h-4 w-4 shrink-0 text-carmine" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                Instagram
                <span className="block text-[11px] font-medium text-ink-soft">
                  {SUPPORT_INSTAGRAM_HANDLE}
                </span>
              </span>
            </a>
            <p className="mt-1 border-t border-ink/10 px-2.5 pt-2 text-[10.5px] leading-snug text-ink/50">
              Pereira Unida es un proyecto ciudadano, sin ánimo de lucro. Escribinos por acá si algo
              no cuadra técnicamente o querés pedir que se borre un dato personal tuyo.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
