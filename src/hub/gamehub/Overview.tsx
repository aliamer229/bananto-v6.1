import { useState } from "react";
import {
  Baby,
  Calendar,
  Clock,
  Gamepad2,
  Gauge,
  HardDrive,
  Languages,
  Shapes,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useHub } from "./hubContext";
import { Section } from "@/hub/ui/Section";
import { Panel } from "@/hub/ui/Panel";
import { Chip, Reveal, SmartImage, Stat } from "@/hub/ui/Bits";
import { NotAvailable } from "@/hub/ui/Fact";
import { PLATFORM_META } from "@/hub/ui/Icons";
import { useI18n } from "@/hub/i18n";
import { formatBytes, formatDate, formatRange } from "@/hub/utils/format";
import { gamePath } from "@/hub/utils/seo";
import { cn } from "@/hub/utils/cn";
import { cdnImage } from "@/lib/img";

/**
 * "Game at a glance" + "Is this game for you?".
 *
 * The tiles share one inset field with hairline separators rather than being
 * individual bordered cards — the requirement is compact and integrated, not a
 * grid of floating chips.
 */
/** First declared frame-rate across the performance profiles (e.g. "60 FPS"). */
function frameRateSummary(game: { performance?: Array<{ modes?: Array<{ frameRate?: { value?: string } }> }> }) {
  for (const profile of game.performance ?? []) {
    for (const mode of profile.modes ?? []) {
      const value = mode.frameRate?.value;
      if (value) return value;
    }
  }
  return null;
}

export function GlanceSection() {
  const { t } = useI18n();
  const { game } = useHub();
  const [expanded, setExpanded] = useState(false);

  const tiles = [
    {
      icon: Gamepad2,
      label: t("glance.platform"),
      value: (game.platforms ?? [])
        .map((p) => PLATFORM_META[p]?.short)
        .filter(Boolean)
        .join(" · "),
      accent: true,
    },
    { icon: Shapes, label: t("glance.genre"), value: <span translate="no">{(game.genres ?? []).join(" · ")}</span> },
    { icon: Users, label: t("glance.players"), value: formatRange(game.multiplayer?.players) },
    {
      icon: Clock,
      label: t("glance.playTime"),
      value: formatRange(game.completion?.mainStoryHours, t("common.hours")),
    },
    {
      icon: HardDrive,
      label: t("glance.downloadSize"),
      value: formatBytes(game.storage?.downloadSizeBytes?.value),
    },
    {
      icon: Languages,
      label: t("glance.languages"),
      value: game.languages?.length
        ? game.languages
            .slice(0, 3)
            .map((l) => l.name)
            .join(" · ") + (game.languages.length > 3 ? ` +${game.languages.length - 3}` : "")
        : null,
    },
    { icon: Calendar, label: t("glance.releaseDate"), value: formatDate(game.releaseDate) },
    {
      icon: Star,
      label: t("glance.rating"),
      value: game.userScore != null ? `${game.userScore.toFixed(1)} / 5` : null,
    },
    {
      icon: Baby,
      label: t("glance.ageRating"),
      value: game.ageRating ? `${game.ageRating.system} ${game.ageRating.label}` : null,
    },
    { icon: Gauge, label: "FPS", value: frameRateSummary(game) },
  ];

  const description = game.description;
  const isLong = (description?.length ?? 0) > 320;

  return (
    <Section
      id="overview"
      eyebrow={t("common.brand")}
      title={t("glance.title")}
      subtitle={t("glance.subtitle")}
      weight="primary"
    >
      <Reveal>
        <Panel className="overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map((tile, index) => (
              <div
                key={tile.label}
                className={cn(
                  "border-white/[0.055]",
                  index % 2 !== 0 && "border-s sm:border-s-0",
                  index % 3 !== 0 && "sm:border-s lg:border-s-0",
                  index % 5 !== 0 && "lg:border-s",
                  index >= 2 && "border-t sm:border-t-0",
                  index >= 3 && "sm:border-t lg:border-t-0",
                  index >= 5 && "lg:border-t",
                )}
              >
                <Stat icon={tile.icon} label={tile.label} accent={tile.accent}>
                  {tile.value ?? <NotAvailable />}
                </Stat>
              </div>
            ))}
          </div>

          {description && (
            <div className="border-t border-white/[0.055] p-5 sm:p-6">
              <h3 className="mb-2 text-sm font-extrabold">{t("glance.about")}</h3>
              <p
                className={cn(
                  "max-w-3xl text-sm leading-[1.75] muted",
                  !expanded && isLong && "line-clamp-4",
                )}
              >
                {description}
              </p>
              {isLong && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-2 text-xs font-bold text-nin-soft hover:underline"
                >
                  {expanded ? t("common.showLess") : t("common.readMore")}
                </button>
              )}
            </div>
          )}
        </Panel>
      </Reveal>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * "Is this game for you?"
 *
 * Recommendation reasons are always shown. A similar game with no stated reason
 * is not a recommendation, it is a guess, so those are filtered out.
 */
export function FitSection() {
  const { t } = useI18n();
  const { game } = useHub();

  const tags = game.audienceTags ?? [];
  const picks = (game.similar ?? []).filter((s) => s.reasons.length > 0).slice(0, 4);

  if (tags.length === 0 && picks.length === 0) return null;

  return (
    <Section id="fit" title={t("fit.title")} subtitle={t("fit.subtitle")} weight="primary">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {tags.length > 0 && (
          <Reveal>
            <Panel className="h-full p-5 sm:p-6">
              <p className="eyebrow mb-4">{t("fit.tags")}</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Chip key={tag.id} tone={tag.positive ? "good" : "default"}>
                    <span translate="no">{tag.label}</span>
                  </Chip>
                ))}
              </div>
            </Panel>
          </Reveal>
        )}

        {picks.length > 0 && (
          <Reveal delay={80}>
            <Panel className="h-full p-5 sm:p-6">
              <p className="eyebrow mb-4 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-warn" />
                {t("fit.perfectIf")}
              </p>
              <ul className="space-y-2.5">
                {picks.map((pick) => (
                  <li key={pick.slug}>
                    <Link
                      to={gamePath(pick.slug)}
                      className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/[0.04]"
                    >
                      <SmartImage
                        src={cdnImage(pick.coverUrl)}
                        alt={pick.title}
                        wrapperClassName="h-14 w-11 shrink-0 rounded-md"
                        className="h-full w-full object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold transition-colors group-hover:text-nin-soft" translate="no">
                          {pick.title}

                        </span>
                        <span className="line-clamp-2 block text-[11px] leading-snug muted">
                          {pick.reasons[0]?.text}
                        </span>
                      </span>
                      {pick.matchScore != null && (
                        <span className="shrink-0 text-[11px] font-extrabold text-good">
                          {Math.round(pick.matchScore * 100)}%
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </Reveal>
        )}
      </div>
    </Section>
  );
}
