"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import { formatTimeAgo } from "@/lib/utils";

/**
 * "Hace X" solo se recalcula al re-renderizar, y sin red no llegan
 * actualizaciones que disparen eso — por eso el propio banner se
 * refresca con un tick mientras esté offline.
 */
export default function OfflineBanner() {
  const { online, offlineSince } = useOnlineStatus();
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (online) return;
    const interval = window.setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => window.clearInterval(interval);
  }, [online]);

  if (online || !offlineSince) return null;

  return (
    <div
      role="status"
      className="glass mt-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-ink"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-hidden="true" />
      <span suppressHydrationWarning>
        Sin conexión. {formatTimeAgo(offlineSince)} · mostrando datos guardados
      </span>
    </div>
  );
}
