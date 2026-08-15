"use client";

import { useMemo, useState } from "react";
import { Home, Share2 } from "lucide-react";
import { RENTAL_PROPERTY_TYPES, type Rental } from "@/lib/types";
import { listShareUrl } from "@/lib/utils";
import RentalCard from "./RentalCard";
import ShareButton from "./ShareButton";

interface RentalsProps {
  rentals: Rental[];
  onPublish: () => void;
  onSeeHelp?: () => void;
  onSelect: (id: string) => void;
  onStatusUpdated: (rental: Rental) => void;
  selectedId?: string | null;
  showCtas?: boolean;
  cityName?: string;
  cityId?: string;
  showMunicipality?: boolean;
}

export default function Rentals({
  rentals,
  onPublish,
  onSeeHelp,
  onSelect,
  onStatusUpdated,
  selectedId = null,
  showCtas = true,
  cityName,
  cityId,
  showMunicipality = false,
}: RentalsProps) {
  const [type, setType] = useState<string>("todos");
  const [availability, setAvailability] = useState<"disponible" | "ocupada">("disponible");

  const listed = useMemo(
    () => rentals.filter((item) => item.status !== "ocultada"),
    [rentals]
  );

  const available = useMemo(
    () => listed.filter((item) => item.status === "disponible"),
    [listed]
  );
  const occupied = useMemo(
    () => listed.filter((item) => item.status === "ocupada"),
    [listed]
  );

  const pool = availability === "disponible" ? available : occupied;

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of pool) {
      counts.set(item.property_type, (counts.get(item.property_type) ?? 0) + 1);
    }
    return counts;
  }, [pool]);

  const visible = useMemo(
    () => (type === "todos" ? pool : pool.filter((item) => item.property_type === type)),
    [pool, type]
  );

  const typeFilters = useMemo(() => {
    const extras = [...typeCounts.keys()].filter(
      (key) => !RENTAL_PROPERTY_TYPES.includes(key as (typeof RENTAL_PROPERTY_TYPES)[number])
    );
    return [...RENTAL_PROPERTY_TYPES, ...extras];
  }, [typeCounts]);

  return (
    <div>
      {showCtas ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPublish}
            className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#1a6b78]/90 text-[13px] font-semibold text-white"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            {cityName ? `Publicar arriendo en ${cityName}` : "Publicar arriendo"}
          </button>
          {onSeeHelp ? (
            <button
              type="button"
              onClick={onSeeHelp}
              className="h-10 shrink-0 rounded-full bg-black/5 px-3 text-[12px] font-semibold text-ink dark:bg-white/10"
            >
              Ver ayudas
            </button>
          ) : null}
          <ShareButton
            title="Arriendos en Pereira Unida"
            text={
              cityName
                ? `Mira todos los arriendos disponibles en ${cityName} en Pereira Unida.`
                : "Mira todos los arriendos disponibles en Pereira Unida."
            }
            url={listShareUrl("arriendos", cityId)}
            label="Compartir la lista de arriendos"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink dark:bg-white/10"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </ShareButton>
        </div>
      ) : null}

      {showCtas ? (
        <div className="mt-2 flex items-center gap-1 rounded-full bg-black/5 p-1 dark:bg-white/10">
          <button
            type="button"
            onClick={() => setAvailability("disponible")}
            className={
              availability === "disponible"
                ? "h-8 flex-1 rounded-full bg-[#1a6b78]/90 text-[12px] font-semibold text-white"
                : "h-8 flex-1 rounded-full text-[12px] font-medium text-ink"
            }
          >
            Disponibles · {available.length}
          </button>
          <button
            type="button"
            onClick={() => setAvailability("ocupada")}
            className={
              availability === "ocupada"
                ? "h-8 flex-1 rounded-full bg-ink/80 text-[12px] font-semibold text-white"
                : "h-8 flex-1 rounded-full text-[12px] font-medium text-ink"
            }
          >
            No disponibles · {occupied.length}
          </button>
        </div>
      ) : null}

      {showCtas ? (
        <div
          className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto touch-pan-x pb-0.5"
          role="tablist"
          aria-label="Filtrar por tipo de inmueble"
        >
          <TypeChip
            label="Todos"
            count={pool.length}
            active={type === "todos"}
            onClick={() => setType("todos")}
          />
          {typeFilters.map((key) => (
            <TypeChip
              key={key}
              label={key}
              count={typeCounts.get(key) ?? 0}
              active={type === key}
              onClick={() => setType(type === key ? "todos" : key)}
            />
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="mt-2 rounded-[22px] bg-black/5 px-4 py-8 text-center dark:bg-white/5">
          <p className="text-[15px] font-medium text-ink-soft">
            {availability === "ocupada"
              ? "Nadie ha marcado arriendos como no disponibles."
              : cityName
                ? `Aún no hay viviendas en arriendo en ${cityName}.`
                : "Aún no hay viviendas en arriendo."}
          </p>
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          {visible.map((rental) => (
            <RentalCard
              key={rental.id}
              rental={rental}
              compact
              selected={rental.id === selectedId}
              showMunicipality={showMunicipality}
              onSelect={() => onSelect(rental.id)}
              onStatusUpdated={onStatusUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TypeChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? "shrink-0 rounded-full bg-[#1a6b78]/90 px-3 py-1.5 text-[12px] font-semibold text-white"
          : "shrink-0 rounded-full bg-black/5 px-3 py-1.5 text-[12px] font-medium text-ink dark:bg-white/10"
      }
    >
      {label}
      {count > 0 ? ` · ${count}` : ""}
    </button>
  );
}
