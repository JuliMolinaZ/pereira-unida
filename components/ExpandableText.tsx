"use client";

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const CLAMP = {
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
} as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Envuelve las apariciones de `terms` (case/accent-insensitive de forma
 * aproximada) en <mark> para que resalten dentro del texto — ver
 * "resaltado de medicamentos críticos" en ReportCard. */
function highlight(text: string, terms: string[]) {
  if (terms.length === 0) return text;
  // Capturing group en split(): los índices impares son siempre los matches.
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="rounded bg-rose-200/70 px-0.5 font-semibold text-rose-900 dark:bg-rose-500/30 dark:text-rose-200"
      >
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

export default function ExpandableText({
  text,
  lines = 3,
  className,
  highlightTerms,
}: {
  text: string;
  lines?: 2 | 3 | 4;
  className?: string;
  /** Términos a resaltar dentro del texto (ver lib/medicine.ts). */
  highlightTerms?: string[];
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => {
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded, lines]);

  if (!text) return null;

  return (
    <div className="min-w-0">
      <p
        ref={ref}
        className={cn(className, !expanded && CLAMP[lines])}
      >
        {highlightTerms ? highlight(text, highlightTerms) : text}
      </p>
      {overflows ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-0.5 text-[12px] font-semibold text-carmine"
        >
          {expanded ? "ver menos" : "ver más..."}
        </button>
      ) : null}
    </div>
  );
}
