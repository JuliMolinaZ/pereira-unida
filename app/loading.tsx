export default function Loading() {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0e0e10]">
      <div className="absolute inset-x-0 top-0 z-10 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="glass h-8 w-40 rounded-full" />
        <div className="glass mt-1.5 h-11 w-full rounded-full" />
      </div>
      <p className="absolute inset-0 flex items-center justify-center text-xs text-white/60">
        Cargando Pereira Unida…
      </p>
    </div>
  );
}
