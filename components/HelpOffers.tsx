"use client";

import { useMemo, useState } from "react";
import { HandHeart, Loader2, MessageCircle, Phone, Share2 } from "lucide-react";
import { hideHelpOffer } from "@/app/actions";
import { cn, formatTimeAgo, listShareUrl, readMyOfferIds, shareToWhatsAppOffer } from "@/lib/utils";
import ExpandableText from "./ExpandableText";
import ShareButton from "./ShareButton";
import FuenteBadge from "./FuenteBadge";
import {
  HELP_SKILL_COLORS,
  HELP_SKILL_EMOJI,
  HELP_SKILL_LABELS,
  HELP_SKILLS,
  type HelpOffer,
  type HelpSkill,
} from "@/lib/types";

interface HelpOffersProps {
  offers: HelpOffer[];
  onPublish: () => void;
  onSeeNeeds: () => void;
  onHidden: (offer: HelpOffer) => void;
  showCtas?: boolean;
  cityName?: string;
  cityId?: string;
}

export default function HelpOffers({
  offers,
  onPublish,
  onSeeNeeds,
  onHidden,
  showCtas = true,
  cityName,
  cityId,
}: HelpOffersProps) {
  const [skill, setSkill] = useState<HelpSkill | "todos">("todos");
  const [hidingId, setHidingId] = useState<string | null>(null);
  const myIds = useMemo(() => new Set(readMyOfferIds()), [offers]);

  const activeOffers = useMemo(
    () => offers.filter((offer) => offer.status === "activa"),
    [offers]
  );

  const skillCounts = useMemo(() => {
    const counts = new Map<HelpSkill, number>();
    for (const offer of activeOffers) {
      counts.set(offer.skill, (counts.get(offer.skill) ?? 0) + 1);
    }
    return counts;
  }, [activeOffers]);

  const visible = useMemo(
    () =>
      skill === "todos" ? activeOffers : activeOffers.filter((offer) => offer.skill === skill),
    [activeOffers, skill]
  );

  async function handleHide(id: string) {
    setHidingId(id);
    const result = await hideHelpOffer(id);
    setHidingId(null);
    if (result.success && result.data) onHidden(result.data);
  }

  return (
    <div>
      {showCtas ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPublish}
            className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-forest/90 text-[13px] font-semibold text-white"
          >
            <HandHeart className="h-4 w-4" aria-hidden="true" />
            Publicar en qué ayudo
          </button>
          <button
            type="button"
            onClick={onSeeNeeds}
            className="h-10 shrink-0 rounded-full bg-black/5 px-3 text-[12px] font-semibold text-forest dark:bg-white/10"
          >
            Pedidos
          </button>
          <ShareButton
            title="Quienes ayudan en Pereira Unida"
            text={
              cityName
                ? `Mira quién ofrece ayuda en ${cityName} en Pereira Unida.`
                : "Mira quién ofrece ayuda en Pereira Unida."
            }
            url={listShareUrl("ofrezco", cityId)}
            label="Compartir la lista de quienes ayudan"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-forest dark:bg-white/10"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </ShareButton>
        </div>
      ) : null}

      {showCtas ? (
        <div
          className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto touch-pan-x pb-0.5"
          role="tablist"
          aria-label="Filtrar por tipo de ayuda"
        >
          <SkillChip
            emoji="🤝"
            label="Todos"
            count={activeOffers.length}
            active={skill === "todos"}
            color="#2f6b4f"
            onClick={() => setSkill("todos")}
          />
          {HELP_SKILLS.map((key) => (
            <SkillChip
              key={key}
              emoji={HELP_SKILL_EMOJI[key]}
              label={HELP_SKILL_LABELS[key]}
              count={skillCounts.get(key) ?? 0}
              active={skill === key}
              color={HELP_SKILL_COLORS[key]}
              onClick={() => setSkill(skill === key ? "todos" : key)}
            />
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="mt-2 rounded-[22px] bg-black/5 px-4 py-8 text-center dark:bg-white/5">
          <p className="text-[15px] font-medium text-ink-soft">
            {skill === "todos"
              ? cityName
                ? `Aún no hay ofertas en ${cityName}. Si puedes ayudar, publícalo.`
                : "Aún no hay ofertas. Si puedes ayudar, publícalo."
              : `Aún no hay nadie de ${HELP_SKILL_LABELS[skill].toLowerCase()}. Si puedes, publícalo.`}
          </p>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
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
    </div>
  );
}

function SkillChip({
  emoji,
  label,
  count,
  active,
  color,
  onClick,
}: {
  emoji: string;
  label: string;
  count: number;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap text-ink transition active:scale-[0.97]",
        !active && "opacity-80"
      )}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} ${active ? "28%" : "14%"}, var(--glass))`,
        boxShadow: active
          ? `inset 0 0 0 1px color-mix(in srgb, ${color} 50%, transparent)`
          : undefined,
      }}
    >
      <span aria-hidden="true">{emoji}</span>
      {label}
      {count > 0 ? (
        <span className="text-[10px] font-semibold opacity-70">{count}</span>
      ) : null}
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
            <span className="ml-auto">
              <FuenteBadge fuente="pereira_unida" />
            </span>
          </div>
          <h3 className="mt-0.5 line-clamp-1 text-[17px] leading-snug font-semibold text-ink">
            {offer.full_name}
          </h3>
          {offer.description ? (
            <ExpandableText
              text={offer.description}
              className="mt-0.5 text-[13px] leading-snug whitespace-pre-wrap break-words text-ink-soft"
            />
          ) : null}
          <p className="mt-1 text-[11px] text-ink-soft" suppressHydrationWarning>
            {formatTimeAgo(offer.created_at)}
          </p>
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
        <ShareButton
          title={`${offer.full_name} ofrece ayuda`}
          text={`${offer.full_name} ofrece ayuda de ${HELP_SKILL_LABELS[offer.skill]} en Pereira Unida.`}
          url={listShareUrl("ofrezco")}
          label={`Compartir la ayuda de ${offer.full_name}`}
        />
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
