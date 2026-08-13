export default function ReportCardSkeleton() {
  return (
    <div className="glass overflow-hidden rounded-[22px] p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="skeleton h-2 w-2 rounded-full" />
        <div className="skeleton h-3 w-20 rounded-full" />
        <div className="skeleton ml-auto h-3 w-10 rounded-full" />
      </div>
      <div className="skeleton mb-1 h-4 w-3/4 rounded-full" />
      <div className="skeleton mb-2 h-3 w-1/2 rounded-full" />
      <div className="flex items-center gap-2">
        <div className="skeleton h-9 flex-1 rounded-full" />
        <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
        <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
      </div>
    </div>
  );
}
