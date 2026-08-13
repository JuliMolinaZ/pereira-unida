"use client";

import { useMemo, useState } from "react";
import { HandHeart, Loader2, MessageCircle, Phone } from "lucide-react";
import { hideHelpOffer } from "@/app/actions";
import { cn, formatTimeAgo, readMyOfferIds, shareToWhatsAppOffer } from "@/lib/utils";
import {
  HELP_SKILL_COLORS,
  HELP_SKILL_EMOJI,
  HELP_SKILL_LABELS,
  HELP_SKILLS,
  type HelpOffer,
  type HelpSkill,
  type Municipality,
} from "@/lib/types";

interface HelpOffersProps {
  offers: HelpOffer[];
  municipality: Municipality | "todos";
  onPublish: () => void;
  onSeeNeeds: () => void;
  onHidden: (offer: HelpOffer) => void;
  showCtas?: boolean;
}

export default function HelpOffers({
  offers,
  municipality,
  onPublish,
  onSeeNeeds,
  onHidden,
  showCtas = true,
}: HelpOffersProps) {
  const [skill, setSkill] = useState<HelpSkill | "todos">("todos");
  const [hidingId, setHidingId] = useState<string | null>(null);
  const myIds = useMemo(() => new Set(readMyOfferIds()), [offers]);

  const visible = useMemo(() => {
    return offers.filter((offer) => {
      if (offer.status !== "activa") return false;
      if (municipality !== "todos" && offer.municipality !== municipality) return false;
      if (skill !== "todos" && offer.skill !== skill) return false;
      return true;
    });
  }, [offers, municipality, skill]);

  const skillCounts = useMemo(() => {
    const counts = new Map<HelpSkill, number>();
    for (const offer of offers) {
      if (offer.status !== "activa") continue;
      if (municipality !== "todos" && offer.municipality !== municipality) continue;
      counts.set(offer.skill, (counts.get(offer.skill) ?? 0) + 1);
    }
    return counts;
  }, [offers, municipality]);

  async function handleHide(id: string) {
    setHidingId(id);
    const result = await hideHelpOffer(id);
    setHidingId(null);
    if (result.success && result.data) onHidden(result.data);
  }

  return (
    <div>
      {showCtas ? (
        <button
          type="button"
          onClick={onPublish}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-forest/90 text-[14px] font-semibold text-white"
        >
          <HandHeart className="h-4 w-4" aria-hidden="true" />
          Publicar en qué ayudo
        </button>
      ) : null}

      {showCtas ? (
        <p className="mt-2 px-1 text-[12px] leading-snug text-ink-soft">
          Personas que ofrecen su oficio o profesión. Toca WhatsApp para escribirles.
        </p>
      ) : null}

      {skillCounts.size > 0 || skill !== "todos" ? (
        <div
          className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1"
          role="tablist"
          aria-label="Filtrar por oficio"
        >
          <SkillChip
            active={skill === "todos"}
            onClick={() => setSkill("todos")}
            label="Todos"
          />
          {HELP_SKILLS.filter((key) => (skillCounts.get(key) ?? 0) > 0 || skill === key).map(
            (key) => (
              <SkillChip
                key={key}
                active={skill === key}
                color={HELP_SKILL_COLORS[key]}
                onClick={() => setSkill(skill === key ? "todos" : key)}
                label={`${HELP_SKILL_EMOJI[key]} ${HELP_SKILL_LABELS[key]}`}
              />
            )
          )}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="mt-2 rounded-[22px] bg-black/5 px-4 py-8 text-center dark:bg-white/5">
          <p className="text-[15px] font-medium text-ink-soft">
            {offers.some((o) => o.status === "activa")
              ? "Nadie con ese oficio en este municipio todavía."
              : "Aún no hay ofertas. Si puedes ayudar, publícalo."}
          </p>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          {visible.map((offer) => (
            <HelpOfferCard
              key={offer.id}
              offer={offer}
              mine={myIds.has(offer.id)}
              hiding={hidingId === offer.id}
              onHide={() => handleHide(offer.id)}
            />
          ))}
        </div>
      )}

      {showCtas ? (
        <button
          type="button"
          onClick={onSeeNeeds}
          className="mt-3 w-full rounded-2xl bg-black/5 px-3 py-2.5 text-center text-[13px] font-semibold text-forest dark:bg-white/10"
        >
          Ver necesidades abiertas
        </button>
      ) : null}
    </div>
  );
}

function SkillChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-8 shrink-0 items-center rounded-full px-3 text-[12px] font-medium whitespace-nowrap transition",
        color
          ? "text-ink"
          : active
            ? "bg-ink text-paper shadow-sm"
            : "bg-black/5 text-ink-soft dark:bg-white/10",
        !active && color && "opacity-80"
      )}
      style={
        color
          ? {
              backgroundColor: `color-mix(in srgb, ${color} ${active ? "28%" : "14%"}, var(--glass))`,
              boxShadow: active
                ? `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)`
                : undefined,
            }
          : undefined
      }
    >
      {label}
    </button>
  );
}

function HelpOfferCard({
  offer,
  mine,
  hiding,
  onHide,
}: {
  offer: HelpOffer;
  mine: boolean;
  hiding: boolean;
  onHide: () => void;
}) {
  const color = HELP_SKILL_COLORS[offer.skill];

  return (
    <article className="glass overflow-hidden rounded-[22px] p-3">
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[20px]"
          style={{ backgroundColor: `${color}22` }}
          aria-hidden="true"
        >
          {HELP_SKILL_EMOJI[offer.skill]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[12px] font-semibold" style={{ color }}>
              {HELP_SKILL_LABELS[offer.skill]}
            </p>
            <span className="ml-auto rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-medium text-ink-soft dark:bg-white/10">
              {offer.municipality}
            </span>
          </div>
          <h3 className="mt-0.5 line-clamp-1 text-[17px] leading-snug font-semibold text-ink">
            {offer.full_name}
          </h3>
          {offer.description ? (
            <p className="mt-0.5 line-clamp-3 text-[13px] leading-snug text-ink-soft">
              {offer.description}
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-ink-soft">{formatTimeAgo(offer.created_at)}</p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <a
          href={shareToWhatsAppOffer(offer)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--whatsapp)] px-3 text-[13px] font-semibold text-white"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          WhatsApp
        </a>
        <a
          href={`tel:${offer.phone}`}
          aria-label={`Llamar a ${offer.full_name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink dark:bg-white/10"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>

      {mine ? (
        <button
          type="button"
          onClick={onHide}
          disabled={hiding}
          className="mt-2 text-[11px] font-semibold text-ink-soft underline underline-offset-2 disabled:opacity-50"
        >
          {hiding ? (
            <Loader2 className="inline h-3 w-3 animate-spin" />
          ) : (
            "Ya no puedo ayudar"
          )}
        </button>
      ) : null}
    </article>
  );
}
