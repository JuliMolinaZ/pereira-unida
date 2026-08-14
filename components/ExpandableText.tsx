"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const CLAMP = {
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
} as const;

export default function ExpandableText({
  text,
  lines = 3,
  className,
}: {
  text: string;
  lines?: 2 | 3 | 4;
  className?: string;
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
        {text}
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
