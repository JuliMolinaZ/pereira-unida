"use client";

interface PhotoStripProps {
  urls: string[] | null | undefined;
  alt: string;
  size?: "sm" | "md";
}

export default function PhotoStrip({ urls, alt, size = "sm" }: PhotoStripProps) {
  if (!urls || urls.length === 0) return null;
  const box = size === "md" ? "h-20 w-20" : "h-14 w-14";

  return (
    <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
      {urls.map((url, index) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- fotos de usuario en CDN (Spaces) */}
          <img
            src={url}
            alt={`${alt} ${index + 1}`}
            className={`${box} rounded-xl object-cover`}
          />
        </a>
      ))}
    </div>
  );
}
