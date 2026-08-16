import { EXTERNAL_FUENTE_COLORS, EXTERNAL_FUENTE_LABELS, type ExternalFuente } from "@/lib/types";

/** Sello de procedencia para datos que vienen de una fuente externa sincronizada. */
export default function FuenteBadge({ fuente }: { fuente: ExternalFuente }) {
  const color = EXTERNAL_FUENTE_COLORS[fuente];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: `${color}1f`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {EXTERNAL_FUENTE_LABELS[fuente]}
    </span>
  );
}
