"use client";

import { SECTOR_QUICK_FILTERS } from "@/lib/sectors";
import { cn } from "@/lib/utils";

interface SectorFilterProps {
  sectorId: string | null;
  onSectorChange: (id: string | null) => void;
}

/**
 * Filtro rápido por sector/comuna (Cuba, Combia, Altagracia...). No hay un
 * listado completo de comunas/corregimientos cargado en la app (haría falta
 * la capa geoespacial del DANE, que no tenemos) — por eso son pastillas
 * fijas con los sectores de más movimiento, no un dropdown searchable de
 * todo Pereira/Dosquebradas.
 */
export default function SectorFilter({ sectorId, onSectorChange }: SectorFilterProps) {
  return (
    <div
      className="no-scrollbar flex gap-1.5 overflow-x-auto touch-pan-x"
      role="tablist"
      aria-label="Filtrar por sector"
    >
      <button
        type="button"
        role="tab"
        aria-selected={sectorId === null}
        onClick={() => onSectorChange(null)}
        className={cn(
          "glass flex h-7 shrink-0 items-center rounded-full px-3 text-[11px] font-medium whitespace-nowrap text-ink transition active:scale-[0.97]",
          sectorId !== null && "opacity-80"
        )}
      >
        Todos los sectores
      </button>
      {SECTOR_QUICK_FILTERS.map((sector) => (
        <button
          key={sector.id}
          type="button"
          role="tab"
          aria-selected={sectorId === sector.id}
          onClick={() => onSectorChange(sectorId === sector.id ? null : sector.id)}
          className={cn(
            "glass flex h-7 shrink-0 items-center rounded-full px-3 text-[11px] font-medium whitespace-nowrap text-ink transition active:scale-[0.97]",
            sectorId !== sector.id && "opacity-80",
            sectorId === sector.id && "ring-1 ring-carmine/50"
          )}
        >
          {sector.label}
        </button>
      ))}
    </div>
  );
}
