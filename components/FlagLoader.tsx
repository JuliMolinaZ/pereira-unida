const STRIPS = Array.from({ length: 16 }, (_, i) => i);

export default function FlagLoader({
  caption = "Cargando…",
}: {
  caption?: string;
}) {
  return (
    <div
      className="flex flex-col items-center"
      role="status"
      aria-live="polite"
      aria-label={caption}
    >
      <div className="relative">
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 blur-2xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--pereira-gold) 55%, transparent) 0%, color-mix(in srgb, var(--pereira-red) 28%, transparent) 42%, transparent 70%)",
          }}
          aria-hidden="true"
        />
        <div className="pu-flag" aria-hidden="true">
          <span className="pu-flag-pole" />
          <span className="pu-flag-cloth">
            {STRIPS.map((i) => (
              <span key={i} style={{ animationDelay: `${i * 55}ms` }} />
            ))}
          </span>
        </div>
      </div>

      <p className="font-display mt-5 text-[22px] leading-none font-semibold tracking-[-0.03em] text-white">
        Pereira Unida
      </p>
      <span
        className="mt-2.5 h-[2px] w-14 rounded-full"
        style={{
          background:
            "linear-gradient(to right, var(--pereira-gold) 50%, var(--pereira-red) 50%)",
        }}
        aria-hidden="true"
      />
      <p className="mt-3 text-[11px] font-medium tracking-[0.14em] text-white/45 uppercase">
        {caption}
      </p>
    </div>
  );
}
