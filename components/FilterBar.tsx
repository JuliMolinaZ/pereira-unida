"use client";

import type { ReactNode } from "react";
import {
  ACOPIO_COLOR,
  CATEGORY_COLORS,
  MUNICIPALITIES,
  MUNICIPALITY_COLORS,
  OFFER_COLOR,
  QUICK_CATEGORY_FILTERS,
  RENTAL_COLOR,
  SERVICE_OUTAGE_COLOR,
  type Municipality,
  type ReportCategory,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export type CategoryQuickFilter =
  | ReportCategory
  | "todos"
  | "puntos_acopio"
  | "vias_cerradas"
  | "ofrezco"
  | "arriendos"
  | "servicios";
export type MunicipalityFilter = Municipality | "todos";
export type TimeWindowFilter = "todas" | "6h";

const HELP_CATEGORY_FILTERS = QUICK_CATEGORY_FILTERS.filter(
  (item): item is { key: ReportCategory; label: string; emoji: string } => item.key !== "todos"
);

interface FilterBarProps {
  municipality: MunicipalityFilter;
  onMunicipalityChange: (value: MunicipalityFilter) => void;
  category: CategoryQuickFilter;
  onCategoryChange: (value: CategoryQuickFilter) => void;
  timeWindow: TimeWindowFilter;
  onTimeWindowChange: (value: TimeWindowFilter) => void;
  showMetroChips?: boolean;
  includeExternal?: boolean;
  onIncludeExternalChange?: (value: boolean) => void;
  criticalMedicineOnly?: boolean;
  onCriticalMedicineOnlyChange?: (value: boolean) => void;
}

export default function FilterBar({
  municipality,
  onMunicipalityChange,
  category,
  onCategoryChange,
  timeWindow,
  onTimeWindowChange,
  showMetroChips = true,
  includeExternal = true,
  onIncludeExternalChange,
  criticalMedicineOnly = false,
  onCriticalMedicineOnlyChange,
}: FilterBarProps) {
  return (
    <div
      className="no-scrollbar flex gap-1.5 overflow-x-auto touch-pan-x"
      role="tablist"
      aria-label="Filtros de municipio, categoría y tiempo"
    >
      <Chip
        active={category === "todos"}
        onClick={() => onCategoryChange("todos")}
      >
        <span aria-hidden="true">🛟</span> Ayudas
      </Chip>
      <Chip
        color={ACOPIO_COLOR}
        active={category === "puntos_acopio"}
        onClick={() => onCategoryChange("puntos_acopio")}
      >
        <span aria-hidden="true">📦</span> Acopio
      </Chip>
      <Chip
        color="#a61b1b"
        active={category === "vias_cerradas"}
        onClick={() => onCategoryChange("vias_cerradas")}
      >
        <span aria-hidden="true">🚧</span> Vías
      </Chip>
      <Chip
        color={SERVICE_OUTAGE_COLOR}
        active={category === "servicios"}
        onClick={() => onCategoryChange("servicios")}
      >
        <span aria-hidden="true">⚡</span> Servicios
      </Chip>
      <Chip
        color={RENTAL_COLOR}
        active={category === "arriendos"}
        onClick={() => onCategoryChange("arriendos")}
      >
        <span aria-hidden="true">🏠</span> Arriendos
      </Chip>
      <Chip
        color={OFFER_COLOR}
        active={category === "ofrezco"}
        onClick={() => onCategoryChange("ofrezco")}
      >
        <span aria-hidden="true">🤝</span> Ayudan
      </Chip>

      {showMetroChips ? (
        <>
          <span className="my-1.5 w-px shrink-0 bg-ink/20" aria-hidden="true" />
          {MUNICIPALITIES.map((m) => (
            <Chip
              key={m}
              color={MUNICIPALITY_COLORS[m]}
              active={municipality === m}
              onClick={() => onMunicipalityChange(municipality === m ? "todos" : m)}
            >
              <span aria-hidden="true">📍</span> {m}
            </Chip>
          ))}
        </>
      ) : null}

      <span className="my-1.5 w-px shrink-0 bg-ink/20" aria-hidden="true" />

      {HELP_CATEGORY_FILTERS.map(({ key, label, emoji }) => (
        <Chip
          key={key}
          color={CATEGORY_COLORS[key]}
          active={category === key}
          onClick={() => onCategoryChange(key)}
        >
          <span aria-hidden="true">{emoji}</span> {label}
        </Chip>
      ))}

      <span className="my-1.5 w-px shrink-0 bg-ink/20" aria-hidden="true" />

      <Chip
        active={timeWindow === "6h"}
        onClick={() => onTimeWindowChange(timeWindow === "6h" ? "todas" : "6h")}
      >
        <span aria-hidden="true">⏱️</span> Últimas 6 h
      </Chip>

      {onCriticalMedicineOnlyChange ? (
        <Chip
          color="#e11d48"
          active={criticalMedicineOnly}
          onClick={() => onCriticalMedicineOnlyChange(!criticalMedicineOnly)}
        >
          <span aria-hidden="true">🩺</span> Solo medicinas críticas
        </Chip>
      ) : null}

      {onIncludeExternalChange ? (
        <>
          <span className="my-1.5 w-px shrink-0 bg-ink/20" aria-hidden="true" />
          <Chip
            active={includeExternal}
            onClick={() => onIncludeExternalChange(!includeExternal)}
          >
            <span aria-hidden="true">🌐</span>{" "}
            {includeExternal ? "Otras fuentes" : "Solo Pereira Unida"}
          </Chip>
        </>
      ) : null}
    </div>
  );
}

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  color?: string;
}

function Chip({ active, onClick, children, color }: ChipProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "glass flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[12px] font-medium whitespace-nowrap text-ink transition active:scale-[0.97] lg:h-9 lg:px-3.5 lg:text-[13px]",
        !active && "opacity-80"
      )}
      style={
        color
          ? {
              backgroundColor: `color-mix(in srgb, ${color} ${active ? "28%" : "14%"}, var(--glass))`,
              boxShadow: active
                ? `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)`
                : undefined,
            }
          : undefined
      }
    >
      {children}
    </button>
  );
}
