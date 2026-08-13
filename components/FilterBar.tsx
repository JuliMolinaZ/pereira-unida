"use client";

import type { ReactNode } from "react";
import {
  ACOPIO_COLOR,
  CATEGORY_COLORS,
  MUNICIPALITIES,
  MUNICIPALITY_COLORS,
  QUICK_CATEGORY_FILTERS,
  type Municipality,
  type ReportCategory,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export type CategoryQuickFilter = ReportCategory | "todos" | "puntos_acopio";
export type MunicipalityFilter = Municipality | "todos";
export type TimeWindowFilter = "todas" | "6h";

interface FilterBarProps {
  municipality: MunicipalityFilter;
  onMunicipalityChange: (value: MunicipalityFilter) => void;
  category: CategoryQuickFilter;
  onCategoryChange: (value: CategoryQuickFilter) => void;
  timeWindow: TimeWindowFilter;
  onTimeWindowChange: (value: TimeWindowFilter) => void;
}

export default function FilterBar({
  municipality,
  onMunicipalityChange,
  category,
  onCategoryChange,
  timeWindow,
  onTimeWindowChange,
}: FilterBarProps) {
  return (
    <div
      className="no-scrollbar flex gap-1.5 overflow-x-auto touch-pan-x"
      role="tablist"
      aria-label="Filtros de municipio, categoría y tiempo"
    >
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

      <span className="my-1.5 w-px shrink-0 bg-ink/20" aria-hidden="true" />

      {QUICK_CATEGORY_FILTERS.map(({ key, label, emoji }) => (
        <Chip
          key={key}
          color={key === "todos" ? undefined : CATEGORY_COLORS[key]}
          active={category === key}
          onClick={() => onCategoryChange(key)}
        >
          <span aria-hidden="true">{emoji}</span> {label}
        </Chip>
      ))}
      <Chip
        color={ACOPIO_COLOR}
        active={category === "puntos_acopio"}
        onClick={() => onCategoryChange("puntos_acopio")}
      >
        <span aria-hidden="true">📦</span> Acopio
      </Chip>

      <span className="my-1.5 w-px shrink-0 bg-ink/20" aria-hidden="true" />

      <Chip
        active={timeWindow === "6h"}
        onClick={() => onTimeWindowChange(timeWindow === "6h" ? "todas" : "6h")}
      >
        <span aria-hidden="true">⏱️</span> Últimas 6 h
      </Chip>
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
