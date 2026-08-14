"use client";

import { MapPin } from "lucide-react";
import type { AppCity } from "@/lib/regions";

type CityBannerAction = "pedir" | "ofrecer" | "familia" | "via" | "arriendo";

const COPY: Record<CityBannerAction, (city: string) => string> = {
  pedir: (city) => `Tu solicitud se ve en ${city}`,
  ofrecer: (city) => `Ofreces ayuda en ${city}`,
  familia: (city) => `Familia en ${city}`,
  via: (city) => `La vía se marca en ${city}`,
  arriendo: (city) => `El arriendo se publica en ${city}`,
};

export default function CityBanner({
  city,
  action,
  onChange,
}: {
  city: AppCity;
  action: CityBannerAction;
  onChange?: () => void;
}) {
  const label = COPY[action](city.name);
  if (!onChange) {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-forest/12 px-3 py-2.5 text-[14px] font-semibold text-ink">
        <MapPin className="h-4 w-4 shrink-0 text-forest" aria-hidden="true" />
        {label}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-center gap-2 rounded-2xl bg-forest/12 px-3 py-2.5 text-left"
    >
      <MapPin className="h-4 w-4 shrink-0 text-forest" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-[14px] font-semibold text-ink">{label}</span>
      <span className="shrink-0 text-[13px] font-semibold text-forest">Cambiar</span>
    </button>
  );
}
