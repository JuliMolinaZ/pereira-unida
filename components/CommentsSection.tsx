"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Loader2, MessageSquareText, Send } from "lucide-react";
import { addComment, getComments } from "@/app/actions";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn, formatTimeAgo } from "@/lib/utils";
import type { Comment } from "@/lib/types";

interface CommentsSectionProps {
  reportId: string;
}

const PREVIEW_COUNT = 2;

export default function CommentsSection({ reportId }: CommentsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isActive = true;

    getComments(reportId).then((data) => {
      if (isActive) {
        setComments(data);
        setLoaded(true);
      }
    });

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`comments-${reportId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `report_id=eq.${reportId}`,
        },
        (payload) => {
          const incoming = payload.new as Comment;
          setComments((prev) =>
            prev.some((c) => c.id === incoming.id) ? prev : [...prev, incoming]
          );
        }
      )
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [reportId]);

  useEffect(() => {
    if (expanded) {
      listEndRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [comments.length, expanded]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setError(null);
    setExpanded(true);

    startTransition(async () => {
      const result = await addComment(reportId, author, content.trim());
      if (result.success && result.data) {
        setComments((prev) =>
          prev.some((c) => c.id === result.data!.id) ? prev : [...prev, result.data!]
        );
        setContent("");
      } else {
        setError(result.error ?? "No se pudo enviar el comentario.");
      }
    });
  }

  const preview = comments.slice(-PREVIEW_COUNT);
  const hiddenCount = Math.max(0, comments.length - PREVIEW_COUNT);
  const visible = expanded ? comments : preview;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex h-9 w-full items-center gap-2 rounded-full bg-black/6 px-3 text-left transition active:scale-[0.99] dark:bg-white/10"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-carmine/12 text-carmine">
          <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink">
          {!loaded
            ? "Notas"
            : comments.length === 0
              ? "Notas de vecinos"
              : comments.length === 1
                ? "1 nota"
                : `${comments.length} notas`}
        </span>
        <span className="text-[11px] font-medium text-ink-soft">
          {expanded ? "Ocultar" : comments.length > 0 ? "Ver todas" : "Escribir"}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-ink-soft transition-transform",
            expanded && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {!loaded ? (
        <p className="flex items-center gap-1.5 px-1 text-[12px] text-ink-soft">
          <Loader2 className="h-3 w-3 animate-spin" /> Cargando notas...
        </p>
      ) : null}

      {loaded && comments.length === 0 && !expanded ? (
        <p className="px-1 text-[12px] text-ink-soft">
          Todavía no hay notas. Tocá para dejar la primera.
        </p>
      ) : null}

      {loaded && visible.length > 0 ? (
        <div className="space-y-1.5 rounded-2xl bg-black/5 p-2.5 dark:bg-white/5">
          {!expanded && hiddenCount > 0 ? (
            <p className="text-[11px] font-medium text-ink-soft">
              +{hiddenCount} {hiddenCount === 1 ? "nota anterior" : "notas anteriores"}
            </p>
          ) : null}
          <div className={cn(expanded && "max-h-44 space-y-2.5 overflow-y-auto")}>
            {visible.map((comment) => (
              <div key={comment.id} className="text-[12px] leading-snug">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-semibold text-ink">{comment.author_name}</span>
                  <span className="text-[11px] text-ink-soft/70">
                    {formatTimeAgo(comment.created_at)}
                  </span>
                </div>
                <p className={cn("text-ink-soft", !expanded && "line-clamp-2")}>
                  {comment.content}
                </p>
              </div>
            ))}
            <div ref={listEndRef} />
          </div>
        </div>
      ) : null}

      {expanded ? (
        <form onSubmit={handleSubmit} className="space-y-1.5">
          {loaded && comments.length === 0 ? (
            <p className="px-1 text-[12px] text-ink-soft">
              Sin notas aún. Sé la primera persona en aportar información.
            </p>
          ) : null}
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Tu nombre (opcional)"
            maxLength={60}
            className="w-full rounded-full bg-black/5 px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-carmine/30 dark:bg-white/10"
          />
          <div className="flex gap-1.5">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escribe una nota o actualización..."
              required
              maxLength={280}
              className="flex-1 rounded-full bg-black/5 px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-carmine/30 dark:bg-white/10"
            />
            <button
              type="submit"
              disabled={isPending || !content.trim()}
              aria-label="Enviar comentario"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-carmine text-white disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          {error ? <p className="text-[11px] text-carmine">{error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
