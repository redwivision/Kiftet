import type { Route } from "./+types/_index";
import { Link } from "react-router";
import { ArrowRight, BookOpenText, BrainCircuit, Mic, Sparkles } from "lucide-react";

import { buttonVariants } from "@kiftet/ui/components/button";
import { cn } from "@kiftet/ui/lib/utils";
import { VoiceRing } from "@/components/voice-ring";

const LOOP = [
  {
    title: "Speak freely",
    text: "Tell Kiftet what you remember with no notes and no scripts.",
    icon: Mic,
  },
  {
    title: "Find the gap",
    text: "The system identifies the concepts and misconceptions you missed.",
    icon: BrainCircuit,
  },
  {
    title: "Learn only what matters",
    text: "A short lesson resets the exact misunderstood ideas, not the whole chapter.",
    icon: BookOpenText,
  },
  {
    title: "Retest and improve",
    text: "Close the loop with fresh questions on the same gaps until they’re gone.",
    icon: Sparkles,
  },
] as const;

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Kiftet — Close the gap" },
    { name: "description", content: "A calm, voice-first study coach for Ethiopian STEM students." },
  ];
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="panel-surface mx-auto overflow-hidden rounded-[2rem] border border-gold/20 bg-[#171f35]/90 p-6 sm:p-8 lg:p-10">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/8 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.26em] text-gold">
              Ethiopia STEM review
            </div>

            <div className="space-y-5">
              <h1 className="font-display text-4xl font-semibold tracking-[-0.05em] text-manuscript sm:text-5xl lg:text-6xl">
                Close the gap.
                <span className="mt-2 block text-gold">Study smarter, not wider.</span>
              </h1>

              <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                Kiftet listens to what you remember, finds the exact concepts you missed, and gives a short, targeted lesson before testing you again.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to="/dashboard"
                className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
              >
                Start studying
                <ArrowRight className="ml-2 size-4" />
              </Link>
              <Link
                to="/dashboard"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto")}
              >
                Choose a chapter
              </Link>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Voice first</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Gap-based review</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">STEM revision</span>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-12 flex flex-col items-center gap-6 text-center">
        <VoiceRing state="idle" onStart={() => {}} onStop={() => {}} />
        <p className="max-w-lg text-sm leading-6 text-muted-foreground">
          Tap the ring and speak what you remember — Kiftet finds the exact concepts you missed, then teaches only those before testing again.
        </p>
        <Link to="/dashboard" className={cn(buttonVariants({ size: "lg" }))}>
          Open the study room
          <ArrowRight className="ml-2 size-4" />
        </Link>
      </div>
    </main>
  );
}
