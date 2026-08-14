"use client";

import type { LucideIcon } from "lucide-react";
import { HandHeart, Home, LifeBuoy, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomDockProps {
  onReportClick: () => void;
  onHelpClick: () => void;
  onFamilyClick: () => void;
  onRentalsClick: () => void;
  helpActive?: boolean;
  rentalsActive?: boolean;
}

export default function ActionCards({
  onReportClick,
  onHelpClick,
  onFamilyClick,
  onRentalsClick,
  helpActive = false,
  rentalsActive = false,
}: BottomDockProps) {
  return (
    <div className="glass pointer-events-auto mx-auto flex w-full max-w-lg flex-row items-stretch rounded-[22px]">
      <DockItem icon={LifeBuoy} label="Pedir" onClick={onReportClick} tinted />
      <DockItem icon={HandHeart} label="Ofrecer" onClick={onHelpClick} accent={helpActive ? "forest" : undefined} />
      <DockItem icon={Users} label="Familia" onClick={onFamilyClick} />
      <DockItem
        icon={Home}
        label="Arriendos"
        onClick={onRentalsClick}
        accent={rentalsActive ? "teal" : undefined}
      />
    </div>
  );
}

interface DockItemProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tinted?: boolean;
  accent?: "forest" | "teal";
}

function DockItem({ icon: Icon, label, onClick, tinted = false, accent }: DockItemProps) {
  const teal = accent === "teal";
  const forest = accent === "forest";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition active:scale-[0.97] lg:gap-1 lg:py-3"
    >
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full lg:h-8 lg:w-8",
          tinted && "bg-carmine/12",
          forest && "bg-forest/12",
          teal && "bg-[#1a6b78]/12"
        )}
      >
        <Icon
          className={cn(
            "h-[18px] w-[18px] lg:h-5 lg:w-5",
            tinted ? "text-carmine" : forest ? "text-forest" : teal ? "text-[#1a6b78]" : "text-ink/75"
          )}
          aria-hidden="true"
        />
      </span>
      <span
        className={cn(
          "text-[10px] font-medium lg:text-[11px]",
          tinted ? "text-carmine" : forest ? "text-forest" : teal ? "text-[#1a6b78]" : "text-ink/75"
        )}
      >
        {label}
      </span>
    </button>
  );
}
