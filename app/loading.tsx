import FlagLoader from "@/components/FlagLoader";

export default function Loading() {
  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-[#0e0e10]">
      <FlagLoader caption="Cargando" />
    </div>
  );
}
