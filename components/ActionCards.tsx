"use client";

import type { LucideIcon } from "lucide-react";
import { HandHeart, LifeBuoy, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomDockProps {
  onReportClick: () => void;
  onHelpClick: () => void;
  onFamilyClick: () => void;
}

export default function ActionCards({
  onReportClick,
  onHelpClick,
  onFamilyClick,
}: BottomDockProps) {
  return (
    <div className="glass pointer-events-auto mx-auto flex w-full max-w-md flex-row items-stretch rounded-[22px]">
      <DockItem icon={LifeBuoy} label="Ayuda" onClick={onReportClick} tinted />
      <DockItem icon={HandHeart} label="Ayudar" onClick={onHelpClick} />
      <DockItem icon={Users} label="Familia" onClick={onFamilyClick} />
    </div>
  );
}

interface DockItemProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tinted?: boolean;
}

function DockItem({ icon: Icon, label, onClick, tinted = false }: DockItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition active:scale-[0.97] lg:gap-1 lg:py-3"
    >
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full lg:h-8 lg:w-8",
          tinted && "bg-carmine/12"
        )}
      >
        <Icon
          className={cn("h-[18px] w-[18px] lg:h-5 lg:w-5", tinted ? "text-carmine" : "text-ink/75")}
          aria-hidden="true"
        />
      </span>
      <span className={cn("text-[10px] font-medium lg:text-[11px]", tinted ? "text-carmine" : "text-ink/75")}>
        {label}
      </span>
    </button>
  );
}
