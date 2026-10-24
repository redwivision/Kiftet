import { cn } from "@kiftet/ui/lib/utils";
import { Mic } from "lucide-react";
import { animate, motion, useMotionValue } from "motion/react";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { ConceptRing, MasteryRing } from "@/components/mastery-ring";
import type { MasteryLevel } from "@/components/study-provider";
import { onIntroDone } from "@/lib/intro-done";
import { type ConceptMeta, weightedMastery } from "@/lib/mastery";
import type { MessageKey } from "@/lib/messages";
import { useOnScreen } from "@/lib/on-screen";

/**
 * The hero's one bold moment: the product, performing.
 *
 * The open ring — the brand's own gap — becomes a living voice. It draws
 * itself, listens (a waveform rides the gap), a real labelled example answer
 * resolves, and the ring spills that answer into a diagnosis: five concepts,
 * two the student explained solidly, one half-known, one stated wrong the
 * classic way, one left open. The ring settles into the score — and then the
 * second half of the promise: one round of the loop closes the heaviest gaps
 * and the score climbs. Diagnosis is only half the story; the film shows the
 * fix too, so the payoff is legible to someone who never scrolls.
 *
 * It is choreography, not a claim: an unaware visitor recognises their own
 * Tuesday night, an aware one watches the one thing no past-paper app does.
 * It is a single pass and collapses to the final frame under
 * `prefers-reduced-motion` — the same contract the rest of the page's reveals
 * already keep.
 *
 * It waits for two things before it plays: the first-load intro to finish (so
 * its opening never races the overlay) and the film to actually be on screen
 * (so a phone visitor who scrolls to it gets the whole thing from frame one,
 * not the tail end). A replay control lets anyone watch it again.
 */

/* The 288° arc — the ring with a 72° segment missing. Same geometry as
   BrandMark, inlined here so it can draw itself with motion's pathLength.
   Exported for the mobile hero's pocket version of this same beat. */
export const OPEN_ARC = "M 93.46 43.12 A 44 44 0 1 1 56.88 6.54";

/* One real Biology 12 checklist, and the levels a spoken recall lands on.
   Concept names reuse the landing's own keys so the film and the product can
   never drift apart. Level 3 solid, 1 half-known, 2 stated-wrong, 0 open. */
const CONCEPTS: readonly {
  key: MessageKey;
  level: MasteryLevel;
  weight: number;
}[] = [
  { key: "demo-c-1", level: 3, weight: 5 },
  { key: "demo-c-2", level: 3, weight: 3 },
  { key: "demo-c-3", level: 1, weight: 4 },
  { key: "demo-c-4", level: 2, weight: 2 },
  { key: "demo-c-5", level: 0, weight: 4 },
];

/* The same checklist after one round of the loop: the stated-wrong belief has
   been corrected and the open idea learned, while the half-known one still
   needs its sentence. The score the film lands on has to be reachable by a real
   student in one sitting, so it is progress, not perfection. */
const IMPROVED: readonly MasteryLevel[] = [3, 3, 1, 3, 3];

/* The last beat everything has settled on. */
const FINAL = 5;

const FILL: Record<number, number> = { 0: 0, 1: 45, 2: 100, 3: 100 };

const heightFor = (w: number) =>
  `${22 + Math.round(((Math.min(5, Math.max(1, w)) - 1) / 4) * 78)}%`;

const LEVEL_COLOR: Record<number, string> = {
  0: "border border-rust/70 border-dashed bg-rust/10",
  1: "bg-gold/80",
  2: "bg-rust/70",
  3: "bg-sage/85",
};

export function HeroFilm({ className }: { className?: string }) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState(0);
  const [reduce, setReduce] = useState(false);
  const [run, setRun] = useState(0);

  // The film plays only once it is both past the intro and on screen. Waiting
  // on the intro keeps its opening from playing under the overlay; waiting on
  // the viewport means a phone visitor who scrolls to it still sees frame one.
  const stage = useOnScreen<HTMLDivElement>();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!stage.shown) return;
    return onIntroDone(() => setArmed(true));
  }, [stage.shown]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run is the replay trigger — bumping it must restart the timeline
  useEffect(() => {
    if (!armed) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setReduce(true);
      setPhase(FINAL);
      return;
    }
    setPhase(0);
    const timers = [
      setTimeout(() => setPhase(1), 150),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1800),
      setTimeout(() => setPhase(4), 2600),
      setTimeout(() => setPhase(FINAL), 3900),
    ];
    return () => timers.forEach(clearTimeout);
  }, [armed, run]);

  const d = reduce ? 0 : 0.55;
  // The score has appeared and the diagnosis is on screen; the ring can morph.
  const done = phase >= 4;
  // One round of the loop has closed the heaviest gaps and the score has climbed.
  const closed = phase >= 5;

  const names = CONCEPTS.map((c) => t(c.key));
  const mastery: Record<string, MasteryLevel> = {};
  const meta: Record<string, ConceptMeta> = {};
  for (const c of CONCEPTS) {
    const name = t(c.key);
    mastery[name] = c.level;
    meta[name] = { weight: c.weight, isMisconception: c.level === 2 };
  }
  const diagnosedPct = Math.round(weightedMastery(mastery, meta, names) * 100);

  const improvedMastery: Record<string, MasteryLevel> = {};
  CONCEPTS.forEach((c, i) => {
    improvedMastery[t(c.key)] = IMPROVED[i] ?? c.level;
  });
  // A corrected belief is no longer a misconception, so it rejoins the total.
  const improvedMeta: Record<string, ConceptMeta> = {};
  for (const c of CONCEPTS) {
    improvedMeta[t(c.key)] = { weight: c.weight, isMisconception: false };
  }
  const improvedPct = Math.round(
    weightedMastery(improvedMastery, improvedMeta, names) * 100,
  );

  // The number counts up as the ring fills, so the climb reads as one motion
  // rather than a jump from the diagnosis to the result.
  const scoreMv = useMotionValue(0);
  const [shownPct, setShownPct] = useState(0);
  useEffect(() => {
    const unsubscribe = scoreMv.on("change", (v) => setShownPct(Math.round(v)));
    return unsubscribe;
  }, [scoreMv]);
  useEffect(() => {
    if (phase < 4) {
      scoreMv.set(0);
      return;
    }
    const target = phase >= 5 ? improvedPct : diagnosedPct;
    if (reduce) {
      scoreMv.set(target);
      return;
    }
    const controls = animate(scoreMv, target, {
      duration: 0.7,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [phase, reduce, diagnosedPct, improvedPct, scoreMv]);

  return (
    <div ref={stage.ref} className={cn("surface overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 border-border/60 border-b px-6 py-3.5 dark:border-white/10">
        <p className="k-label">{t("diag-unit")}</p>
        <span className="rounded-full border border-border/70 px-2.5 py-0.5 font-medium text-[0.72rem] text-muted-foreground dark:border-white/15">
          {t("example-label")}
        </span>
      </div>

      <div className="px-6 py-6">
        {/* The stage: ring → listening → score. Only the rings carry the shared
            view-transition name, so starting the demo morphs the hero ring into
            the chapter's ring on the dashboard without dragging the mic, the
            waveform or the number along for the ride. */}
        <div className="relative mx-auto grid size-52 place-items-center">
          {/* The morphing element: the rings alone. Before the answer lands it
              is the open arc drawing itself; afterwards the settled score. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center [view-transition-name:kiftet-ring]"
          >
            {/* The open ring drawing itself */}
            <motion.svg
              viewBox="0 0 100 100"
              fill="none"
              className="absolute inset-0 size-full text-gold"
              animate={{ opacity: done ? 0 : 1 }}
              transition={{ duration: 0.4 }}
            >
              <motion.path
                d={OPEN_ARC}
                stroke="currentColor"
                strokeWidth={4}
                strokeLinecap="round"
                initial={false}
                animate={{ pathLength: phase >= 1 ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.9, ease: "easeOut" }}
              />
            </motion.svg>

            {/* The score ring, once the answer has been graded */}
            <motion.div
              className="absolute inset-0 grid place-items-center"
              initial={false}
              animate={{ opacity: done ? 1 : 0 }}
              transition={{ duration: 0.4, delay: done && !reduce ? 0.1 : 0 }}
            >
              <MasteryRing
                percent={done ? (closed ? improvedPct : diagnosedPct) : 0}
                size={208}
              />
            </motion.div>
          </div>

          {/* The centre while it listens */}
          <motion.div
            className="relative grid place-items-center"
            initial={false}
            animate={{ opacity: done ? 0 : 1 }}
            transition={{ duration: 0.3 }}
          >
            <span className="absolute size-24 animate-breathe rounded-full bg-gold/15 motion-reduce:animate-none" />
            <span className="relative grid size-20 place-items-center rounded-full border-2 border-gold/50 bg-night-raised text-gold">
              <Mic className="size-9" aria-hidden="true" />
            </span>
          </motion.div>

          {/* The score itself — a sibling of the ring, so it fades with the page
              rather than riding the ring into the dashboard. */}
          <motion.p
            aria-hidden={!done}
            className="absolute font-display font-semibold text-4xl text-foreground tabular-nums tracking-[-0.03em]"
            initial={false}
            animate={{ opacity: done ? 1 : 0 }}
            transition={{ duration: 0.4, delay: done && !reduce ? 0.1 : 0 }}
          >
            {shownPct}
            <span className="text-muted-foreground text-xl">%</span>
          </motion.p>

          {/* The voice: a waveform riding the gap while listening */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 -bottom-1 flex h-14 items-end justify-center gap-[3px]"
            style={{
              opacity: phase === 2 || phase === 3 ? 1 : 0,
              transition: "opacity 300ms",
            }}
          >
            {Array.from({ length: 23 }).map((_, i) => (
              <span
                key={i}
                className="w-[3px] animate-hero-wave rounded-full bg-gold/70 motion-reduce:animate-none"
                style={{
                  height: `${16 + ((i * 7) % 40)}px`,
                  animationDelay: `${(i % 7) * 90}ms`,
                  transformOrigin: "bottom",
                }}
              />
            ))}
          </div>
        </div>

        {/* The prompt leads — it is on screen before the ring starts, so the
            animation always has a question to answer rather than playing into
            a void. The student's answer follows it. */}
        <div className="mt-4 min-h-[3.75rem] text-center">
          <p className="text-muted-foreground text-sm">
            {t("hero-film-prompt")}
          </p>
          <motion.p
            className="mt-1.5 text-foreground text-sm leading-6"
            initial={false}
            animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 6 }}
            transition={{ duration: d }}
          >
            <span className="text-gold">“</span>
            {t("hero-film-said")}
            <span className="text-gold">”</span>
          </motion.p>
        </div>

        {/* The diagnosis: importance as height, mastery as fill */}
        <motion.div
          className="mt-5"
          initial={false}
          animate={{ opacity: phase >= 3 ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex h-16 items-end gap-1.5" aria-hidden="true">
            {CONCEPTS.map((c, i) => {
              const open = c.level === 0;
              return (
                <motion.span
                  key={c.key}
                  className={cn(
                    "relative flex-1 overflow-hidden rounded-t-md",
                    open ? LEVEL_COLOR[0] : "bg-sage/15",
                  )}
                  style={{
                    height: open ? heightFor(c.weight) : "100%",
                    transformOrigin: "bottom",
                  }}
                  initial={false}
                  animate={{ scaleY: phase >= 3 ? 1 : 0 }}
                  transition={{
                    duration: reduce ? 0 : 0.4,
                    delay: reduce ? 0 : i * 0.07,
                  }}
                >
                  {!open && (
                    <span
                      className={cn(
                        "absolute inset-x-0 bottom-0",
                        LEVEL_COLOR[c.level],
                      )}
                      style={{ height: `${FILL[c.level] ?? 0}%` }}
                    />
                  )}
                </motion.span>
              );
            })}
          </div>

          <p className="k-label mt-3">
            {t("hero-film-tally", {
              known: CONCEPTS.filter((c) => c.level === 3).length,
              total: CONCEPTS.length,
            })}
          </p>
        </motion.div>

        {/* The punchline */}
        <motion.p
          className="mt-3 text-foreground text-sm leading-6"
          initial={false}
          animate={{ opacity: phase >= 4 ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        >
          {t("hero-film-miss")}
        </motion.p>

        {/* The payoff: one round later the gaps are closing and the number
            climbs. Diagnosis is only half the promise — this is the other half,
            shown rather than claimed. */}
        <motion.p
          className="mt-3 font-medium text-gold text-sm leading-6"
          initial={false}
          animate={{ opacity: phase >= 5 ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        >
          {t("hero-film-improved")}
        </motion.p>
      </div>

      <div className="flex items-center justify-between gap-3 border-border/60 border-t px-6 py-3 dark:border-white/10">
        <div className="flex items-center gap-2 text-[0.72rem] text-muted-foreground">
          {CONCEPTS.map((c) => (
            <ConceptRing key={c.key} level={c.level} size={14} />
          ))}
          <span className="ml-1 hidden sm:inline">{t("diag-one-minute")}</span>
        </div>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="rounded-full px-2.5 py-1 text-muted-foreground text-xs transition-colors duration-200 hover:text-foreground focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2"
        >
          {t("hero-film-replay")}
        </button>
      </div>
    </div>
  );
}
