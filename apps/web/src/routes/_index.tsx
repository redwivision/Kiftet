import type { Route } from "./+types/_index";
import { Link } from "react-router";

import { buttonVariants } from "@kiftet/ui/components/button";
import { cn } from "@kiftet/ui/lib/utils";

function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo-mark.jpeg"
      alt=""
      width={120}
      height={120}
      className={cn("size-24 rounded-full object-cover", className)}
    />
  );
}

const LOOP = [
  "Speak a concept, free-form.",
  "Kiftet finds what's missing.",
  "Relearn only the gaps.",
  "Retest until they close.",
] as const;

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Kiftet — Close the gap" },
    { name: "description", content: "Find what's missing in your Grade 11–12 STEM studies and close the gap." },
  ];
}

export default function Home() {
  return (
    <main className="mx-auto grid min-h-svh w-full max-w-md content-center gap-10 px-6 py-16">
      <div className="flex flex-col items-center gap-6 text-center">
        <LogoMark />

        <div className="space-y-3">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-manuscript">
            Welcome to&nbsp;
            <span className="text-gold">Kiftet</span>
          </h1>
          <p className="font-display text-lg text-manuscript/90">Close the gap.</p>
        </div>

        <p className="text-base leading-relaxed text-muted-foreground">
          Find what’s missing in your Grade&nbsp;11–12 STEM studies and close it —
          lesson by lesson, gap by gap. So when the national exam comes, nothing
          is left to chance.
        </p>
      </div>

      <ol className="space-y-3">
        {LOOP.map((step, i) => (
          <li key={step} className="flex items-start gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-gold/40 text-xs text-gold">
              {i + 1}
            </span>
            <span className="text-sm text-manuscript/85">{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col items-center gap-3">
        <Link
          to="/dashboard"
          className={cn(buttonVariants({ size: "lg" }), "w-full max-w-56")}
        >
          Start studying
        </Link>
        <p className="text-xs text-muted-foreground">Free for Ethiopian grade 11–12 students.</p>
      </div>
    </main>
  );
}