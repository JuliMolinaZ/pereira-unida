"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** Bandera de Pereira: franja superior amarilla, inferior roja. */
export function PereiraFlag({ className }: { className?: string }) {
  const clipId = useId();
  const shineId = useId();

  return (
    <svg
      viewBox="0 0 30 20"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <rect width="30" height="20" rx="5" />
        </clipPath>
        <linearGradient id={shineId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="30" height="10" fill="var(--pereira-gold)" />
        <rect y="10" width="30" height="10" fill="var(--pereira-red)" />
        <rect width="30" height="20" fill={`url(#${shineId})`} />
      </g>
      <rect
        x="0.4"
        y="0.4"
        width="29.2"
        height="19.2"
        rx="4.6"
        fill="none"
        stroke="rgba(255,255,255,0.72)"
        strokeWidth="0.8"
      />
    </svg>
  );
}

export default function BrandMark({
  className,
  wordmarkClassName,
}: {
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <PereiraFlag className="h-[18px] w-[27px]" />
      <span
        className={cn(
          "font-display text-[16px] leading-none font-semibold tracking-[-0.03em] text-ink",
          wordmarkClassName
        )}
      >
        Pereira Unida
      </span>
    </div>
  );
}
