"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Report } from "@/lib/types";
import ReportCard from "./ReportCard";

const ROW_H = 76;
const GAP = 0;
const OVERSCAN = 12;

export default function DenseReportList({
  reports,
  selectedId,
  scrollRef,
  onSelect,
  onStatusUpdated,
  showMunicipality = false,
}: {
  reports: Report[];
  selectedId: string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  onStatusUpdated: (report: Report) => void;
  showMunicipality?: boolean;
}) {
  const selectedWrapRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);
  const [selectedH, setSelectedH] = useState(340);

  const selectedIndex = useMemo(
    () => reports.findIndex((r) => r.id === selectedId),
    [reports, selectedId]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    el.addEventListener("scroll", onScroll, { passive: true });
    setViewportH(el.clientHeight);
    setScrollTop(el.scrollTop);
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [scrollRef]);

  useEffect(() => {
    const el = selectedWrapRef.current;
    if (!el || selectedIndex < 0) return;
    const ro = new ResizeObserver(() => setSelectedH(Math.max(el.offsetHeight, ROW_H)));
    ro.observe(el);
    setSelectedH(Math.max(el.offsetHeight, ROW_H));
    return () => ro.disconnect();
  }, [selectedId, selectedIndex]);

  useEffect(() => {
    if (selectedIndex < 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const top = selectedIndex * (ROW_H + GAP);
    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight;
    if (top < viewTop + 48 || top > viewBottom - 96) {
      el.scrollTo({ top: Math.max(0, top - 56), behavior: "smooth" });
    }
  }, [selectedId, selectedIndex, scrollRef]);

  const stride = ROW_H + GAP;

  function yAt(index: number) {
    if (selectedIndex < 0 || index <= selectedIndex) return index * stride;
    return selectedIndex * stride + selectedH + GAP + (index - selectedIndex - 1) * stride;
  }

  const lastIndex = Math.max(0, reports.length - 1);
  const lastHeight = selectedIndex === lastIndex && selectedIndex >= 0 ? selectedH : ROW_H;
  const totalH = reports.length === 0 ? 0 : yAt(lastIndex) + lastHeight;

  let start = 0;
  if (selectedIndex >= 0 && scrollTop >= yAt(selectedIndex) + selectedH) {
    const after = scrollTop - (yAt(selectedIndex) + selectedH + GAP);
    start = selectedIndex + 1 + Math.floor(after / stride);
  } else {
    start = Math.floor(scrollTop / stride);
    if (selectedIndex >= 0 && start > selectedIndex) start = selectedIndex;
  }
  start = Math.max(0, Math.min(reports.length, start) - OVERSCAN);

  const endY = scrollTop + viewportH;
  let end = start;
  while (end < reports.length && yAt(end) < endY) end += 1;
  end = Math.min(reports.length, end + OVERSCAN);

  return (
    <div className="relative" style={{ height: totalH }}>
      {reports.slice(start, end).map((report, offset) => {
        const index = start + offset;
        const selected = report.id === selectedId;
        return (
          <div
            key={report.id}
            ref={selected ? selectedWrapRef : undefined}
            className="absolute right-0 left-0"
            style={{ top: yAt(index) }}
          >
            <ReportCard
              report={report}
              compact
              onStatusUpdated={onStatusUpdated}
              selected={selected}
              onSelect={() => onSelect(report.id)}
              showMunicipality={showMunicipality}
            />
          </div>
        );
      })}
    </div>
  );
}
