"use client";

import type { MouseEvent, ReactNode } from "react";
import { Share2 } from "lucide-react";

interface ShareButtonProps {
  title: string;
  text: string;
  url: string;
  label: string;
  className?: string;
  children?: ReactNode;
}

/**
 * Comparte con el selector nativo del celular (elegir grupo/contacto de
 * WhatsApp, Telegram, SMS, etc.). Si el navegador no soporta Web Share,
 * cae a un link de WhatsApp sin número fijo (abre el selector de chats).
 */
export default function ShareButton({ title, text, url, label, className, children }: ShareButtonProps) {
  async function handleShare(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    const shareText = encodeURIComponent(`${text}\n${url}`);
    window.open(`https://wa.me/?text=${shareText}`, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={label}
      className={
        className ??
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink dark:bg-white/10"
      }
    >
      {children ?? <Share2 className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
