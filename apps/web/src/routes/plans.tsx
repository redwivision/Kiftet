import { buttonVariants } from "@kiftet/ui/components/button";
import { cn } from "@kiftet/ui/lib/utils";
import { Check } from "lucide-react";
import { Link } from "react-router";
import { useLanguage } from "@/components/language-provider";
import type { MessageKey } from "@/lib/messages";
import type { Route } from "./+types/plans";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Plans — Kiftet" },
    {
      name: "description",
      content:
        "See what's available with Kiftet today and get notified when paid plans are ready.",
    },
  ];
}

const FREE_FEATURES: readonly MessageKey[] = [
  "plans-free-feature-loop",
  "plans-free-feature-roadmap",
  "plans-free-feature-books",
  "plans-free-feature-progress",
];

export default function Plans() {
  const { t } = useLanguage();

  return (
    <main className="mx-auto w-full max-w-5xl px-3 py-8 sm:px-6 sm:py-16 lg:px-8">
      <header className="mx-auto max-w-2xl space-y-3 text-center">
        <p className="k-label">{t("plans-eyebrow")}</p>
        <h1 className="font-display font-semibold text-3xl tracking-[-0.03em] sm:text-5xl">
          {t("plans-title")}
        </h1>
        <p className="text-base text-muted-foreground leading-7">
          {t("plans-description")}
        </p>
      </header>

      <section
        aria-label={t("plans-status-title")}
        className="mx-auto mt-10 max-w-3xl bg-foreground px-6 py-6 text-background sm:px-8 sm:py-7"
      >
        <p className="text-xs uppercase tracking-[0.16em]">
          {t("plans-status-label")}
        </p>
        <h2 className="mt-2 font-display font-semibold text-xl tracking-tight sm:text-2xl">
          {t("plans-status-title")}
        </h2>
        <p className="mt-2 max-w-2xl text-background/75 text-sm leading-6">
          {t("plans-status-body")}
        </p>
      </section>

      <div className="mx-auto mt-8 grid max-w-3xl gap-4 md:grid-cols-2">
        <section className="surface flex flex-col border p-6 sm:p-7">
          <div>
            <p className="text-muted-foreground text-sm">
              {t("plans-available")}
            </p>
            <h2 className="mt-2 font-display font-semibold text-2xl tracking-tight">
              {t("plans-free-title")}
            </h2>
            <p className="mt-3 text-muted-foreground text-sm leading-6">
              {t("plans-free-description")}
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              {FREE_FEATURES.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-3 text-sm leading-6"
                >
                  <Check
                    className="mt-1 size-4 shrink-0 text-foreground"
                    aria-hidden="true"
                  />
                  <span>{t(feature)}</span>
                </li>
              ))}
            </ul>
          </div>
          <Link
            to="/"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "mt-8 w-full",
            )}
          >
            {t("plans-free-cta")}
          </Link>
        </section>

        <section className="surface flex flex-col border-foreground/40 p-6 sm:p-7">
          <div>
            <p className="text-muted-foreground text-sm">
              {t("plans-not-ready")}
            </p>
            <h2 className="mt-2 font-display font-semibold text-2xl tracking-tight">
              {t("plans-premium-title")}
            </h2>
            <p className="mt-3 text-muted-foreground text-sm leading-6">
              {t("plans-premium-description")}
            </p>
            <div className="mt-6 border-t pt-5">
              <p className="text-muted-foreground text-sm">
                {t("plans-telebirr-label")}
              </p>
              <p className="mt-1 font-medium text-lg tracking-wide">
                +251968099678
              </p>
              <p className="mt-3 text-muted-foreground text-sm leading-6">
                {t("plans-payment-note")}
              </p>
            </div>
          </div>
          <div className="mt-auto pt-8">
            <a
              href="sms:+251968099678"
              className={cn(buttonVariants(), "w-full justify-center")}
            >
              {t("plans-premium-cta")}
            </a>
            <p className="mt-3 text-center text-muted-foreground text-xs leading-5">
              {t("plans-no-charge")}
            </p>
          </div>
        </section>
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-muted-foreground text-sm leading-6">
        {t("plans-transparency")}
      </p>
    </main>
  );
}
