"use client";

import { useState } from "react";
import { Earth, MapPin, Phone, Search, X } from "lucide-react";
import BrandMark from "./BrandMark";
import { EMERGENCY_HOTLINES } from "@/lib/emergency";
import { SUPPORT_INSTAGRAM_URL, SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_URL } from "@/lib/support";

interface HeaderProps {
  liveCount: number;
  criticalCount?: number;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  cityName: string;
  onCityClick: () => void;
  nationwide?: boolean;
  nationalActive?: number | null;
  onSeeCountry?: () => void;
}

export default function Header({
  liveCount,
  criticalCount = 0,
  searchQuery,
  onSearchQueryChange,
  cityName,
  onCityClick,
  nationwide = false,
  nationalActive = null,
  onSeeCountry,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <div
          className="glass relative flex shrink-0 items-center overflow-hidden rounded-full py-1 pr-2.5 pl-1 lg:py-1.5 lg:pr-3.5 lg:pl-1.5"
          aria-label="Pereira Unida"
        >
          <span
            className="pointer-events-none absolute inset-y-0 left-0 w-[3px]"
            style={{
              background:
                "linear-gradient(to bottom, var(--pereira-gold) 50%, var(--pereira-red) 50%)",
            }}
            aria-hidden="true"
          />
          <BrandMark
            className="pl-1 lg:pl-1.5"
            wordmarkClassName="text-[13px] lg:text-[16px]"
          />
        </div>
        <button
          type="button"
          onClick={onCityClick}
          aria-label={`Estás en ${cityName}. Cambiar ciudad`}
          className="glass flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 text-left"
        >
          <MapPin className="h-4 w-4 shrink-0 text-carmine" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
            {cityName}
          </span>
          <span className="shrink-0 text-[12px] font-semibold text-carmine">Cambiar</span>
        </button>
      </div>

      {!nationwide && onSeeCountry ? (
        <button
          type="button"
          onClick={onSeeCountry}
          aria-label="Ver solicitudes de todo Colombia"
          className="glass flex h-10 w-full items-center gap-2 rounded-full px-3 text-left"
        >
          <Earth className="h-4 w-4 shrink-0 text-forest" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
            Colombia
            {nationalActive != null ? (
              <>
                {" · "}
                <span className="tabular-nums">{nationalActive}</span>
                {nationalActive === 1 ? " activa en el país" : " activas en el país"}
              </>
            ) : (
              " · ver todo el país"
            )}
          </span>
          <span className="shrink-0 text-[12px] font-semibold text-forest">Ver</span>
        </button>
      ) : null}

      <div className="flex items-center gap-1.5">
        <label className="glass flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full pr-2.5 pl-3.5">
          <Search className="h-[18px] w-[18px] shrink-0 text-ink/55" aria-hidden="true" />
          <span className="sr-only">Buscar hospital, clínica, acopio o necesidad</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Buscar barrio, hospital…"
            className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-ink/45"
          />
          <span className="flex shrink-0 items-center gap-1.5 border-l border-ink/10 pl-2 text-[11px] font-medium text-ink/70">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-forest opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-forest" />
            </span>
            <span className="tabular-nums">{liveCount}</span>
            <span className="hidden min-[420px]:inline">activos</span>
            {criticalCount > 0 ? (
              <span className="text-carmine">
                · {criticalCount}
                <span className="hidden min-[420px]:inline"> críticos</span>
              </span>
            ) : null}
          </span>
        </label>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            aria-label="Líneas de emergencia"
            className="glass flex h-11 w-11 items-center justify-center rounded-full text-carmine transition active:scale-[0.97]"
          >
            <Phone className="h-5 w-5" aria-hidden="true" />
          </button>

          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div className="glass absolute top-full right-0 z-50 mt-2 w-64 rounded-[22px] p-1.5 text-ink">
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[11px] font-medium text-ink/60">Líneas de emergencia</span>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    aria-label="Cerrar"
                    className="text-ink/50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {EMERGENCY_HOTLINES.map((line) => (
                  <a
                    key={line.number}
                    href={`tel:${line.number}`}
                    className="flex items-center justify-between rounded-2xl px-2.5 py-2.5 text-[15px] font-medium transition active:bg-ink/8"
                  >
                    <span>{line.label}</span>
                    <span className="font-semibold text-carmine">{line.number}</span>
                  </a>
                ))}
                <a
                  href={SUPPORT_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 flex items-center justify-between rounded-2xl border-t border-ink/8 px-2.5 py-2.5 text-[13px] font-medium text-ink/70 transition active:bg-ink/8"
                >
                  Soporte por WhatsApp
                  <span className="text-[11px] font-semibold text-ink/50">{SUPPORT_WHATSAPP_DISPLAY}</span>
                </a>
                <a
                  href={SUPPORT_INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-2xl px-2.5 py-2.5 text-[13px] font-medium text-ink/70 transition active:bg-ink/8"
                >
                  Soporte por Instagram
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
