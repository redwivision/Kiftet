import { Button, buttonVariants } from "@kiftet/ui/components/button";
import { Checkbox } from "@kiftet/ui/components/checkbox";
import { Input } from "@kiftet/ui/components/input";
import { Label } from "@kiftet/ui/components/label";
import { cn } from "@kiftet/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import z from "zod";
import { apiUrl } from "@/lib/api";

import { useLanguage } from "./language-provider";

/**
 * Local cache of this browser's signup id.
 *
 * This is a convenience, never an authority: everything it drives is
 * re-fetched from the server, so clearing it, switching phones, or sharing a
 * device costs someone their progress display but never their place in line.
 * The number itself is the identity — the phone is the unique column, so a
 * second submission updates the first rather than creating a duplicate.
 */
const STORAGE_KEY = "kiftet-waitlist-id";

type WaitlistStatus = {
  id: string;
  wave: number;
  joinedChannel: boolean;
  testimonialSubmitted: boolean;
  eligibleForPremium: boolean;
  // Mirrors `nextStep` in apps/server/src/routes/waitlist.ts — which is the
  // source of truth, since it derives this from the stored facts. The server
  // returns `verify-channel` for a student whose join we have not confirmed;
  // a union that omits a value the server sends is not a stale type, it is a
  // button that will never render.
  nextStep:
    | "join-channel"
    | "verify-channel"
    | "write-testimonial"
    | "ready"
    | null;
  premiumMonths: number;
  telegramUrl: string | null;
  channelUrl: string | null;
};

function readStoredId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing and locked-down browsers throw on storage access. The
    // form still works; it just can't remember between visits.
    return null;
  }
}

function storeId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* see readStoredId */
  }
}

/**
 * The current offer, read from the server rather than restated here.
 *
 * `premiumMonths` is null until we know it, and the reward sentence is only
 * rendered once it is. A form that says "1 month" from a hardcoded constant
 * while the server says something else is a promise made to students that the
 * code does not intend to keep — and it is invisible until someone changes the
 * reward and nobody notices the advertisement. Showing nothing beats showing
 * something stale, and the rest of the form works either way.
 */
type Promise = { premiumMonths: number } | null;

function usePromise(): Promise {
  const [promise, setPromise] = useState<Promise>(null);
  useEffect(() => {
    let live = true;
    fetch(apiUrl("/waitlist/promise"))
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (live && body && typeof body.premiumMonths === "number")
          setPromise({ premiumMonths: body.premiumMonths });
      })
      .catch(() => {
        // Offline or shed. The form still submits; only the reward sentence is
        // withheld, because we cannot honestly state a number we don't have.
      });
    return () => {
      live = false;
    };
  }, []);
  return promise;
}

export default function WaitlistForm() {
  const { t, lang } = useLanguage();

  // `null` until we know. Guessing "form" first would flash a form at someone
  // who is already on the list, and flashing the form is how people submit
  // twice and think they've been charged or double-counted.
  const [status, setStatus] = useState<WaitlistStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [closed, setClosed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Read in an effect, not during render. This component is server-rendered,
  // and `window.localStorage` does not exist there — reading it inline renders
  // the server HTML without the "check my place" button and then produces it on
  // hydration, which is a mismatch warning on precisely the returning visitor.
  const [knownId, setKnownId] = useState<string | null>(null);
  useEffect(() => setKnownId(readStoredId()), []);

  // An error that only changes colour is not an error to a screen reader, and
  // one that stays off-screen is not an error to anyone on a phone. The notice
  // is the only channel the form has for a failed submit, so it announces
  // itself and takes focus — the student just pressed the button and is
  // waiting to be told what happened.
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);
  const promise = usePromise();

  const check = async () => {
    const id = readStoredId();
    if (!id) {
      setNotice(t("waitlist-check"));
      return;
    }
    setChecking(true);
    try {
      const res = await fetch(
        apiUrl(`/waitlist/status?id=${encodeURIComponent(id)}`),
      );
      if (!res.ok) throw new Error(String(res.status));
      setStatus((await res.json()) as WaitlistStatus);
      setNotice(null);
    } catch {
      // A status refresh that fails should not wipe the confirmation someone is
      // looking at. Say so and leave what we know on screen.
      setNotice(t("waitlist-network"));
    } finally {
      setChecking(false);
    }
  };

  const form = useForm({
    defaultValues: { name: "", phone: "", consent: false, website: "" },
    onSubmit: async ({ value }) => {
      setNotice(null);
      try {
        const res = await fetch(apiUrl("/waitlist"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...value, language: lang }),
        });
        const body = (await res.json()) as Partial<WaitlistStatus> & {
          ok?: boolean;
          closed?: boolean;
          field?: string;
          error?: string;
        };

        if (body.closed) {
          setClosed(true);
          return;
        }
        if (!res.ok) {
          setNotice(
            body.field === "phone"
              ? t("waitlist-invalid-phone")
              : (body.error ?? t("waitlist-network")),
          );
          return;
        }
        if (body.id) storeId(body.id);
        setStatus(body as WaitlistStatus);
      } catch {
        setNotice(t("waitlist-network"));
      }
    },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(2),
        phone: z
          .string()
          .trim()
          .min(6)
          .refine((raw) => raw.replace(/\D/g, "").length >= 9),
        consent: z.literal(true),
        website: z.string().max(0),
      }),
    },
  });

  if (closed) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">{t("waitlist-closed")}</p>
        {status?.channelUrl && (
          <a
            href={status.channelUrl}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {t("waitlist-open-channel")}
          </a>
        )}
      </div>
    );
  }

  if (status) {
    const done = status.nextStep === "ready";
    return (
      <div className="space-y-4">
        <p className="text-gold">{t("waitlist-joined")}</p>
        <p className="text-muted-foreground">
          {t("waitlist-wave", { wave: status.wave })}
        </p>

        {/* Exactly one thing left to do, ever. The server decides which, so
            this can't drift from the eligibility rule it claims to show. */}
        <ol className="space-y-2">
          <li className={status.joinedChannel ? "text-gold line-through" : ""}>
            {t("waitlist-step-channel")}
          </li>
          {/* Confirmation is its own step because it is its own action. We learn
              that someone joined from Telegram, not from the browser, so "joined"
              and "confirmed" are genuinely different moments — and a student
              whose join happened before they pressed Start has no other way to
              be believed. Without this line the first step would tick itself off
              for people who did nothing, which is the bug the server-side check
              was added to fix. */}
          <li className={status.joinedChannel ? "text-gold line-through" : ""}>
            {t("waitlist-step-verify")}
          </li>
          <li
            className={
              status.testimonialSubmitted ? "text-gold line-through" : ""
            }
          >
            {t("waitlist-step-testimonial")}
          </li>
        </ol>

        {!status.joinedChannel && (
          <p className="text-muted-foreground text-sm">
            {t("waitlist-verify-hint")}
          </p>
        )}

        {done && <p className="text-sm">{t("waitlist-step-done")}</p>}

        <div className="flex flex-wrap gap-2">
          {status.nextStep === "join-channel" && (
            <>
              {status.telegramUrl && (
                <a href={status.telegramUrl} className={cn(buttonVariants())}>
                  {t("waitlist-open-telegram")}
                </a>
              )}
              {status.channelUrl && (
                <a
                  href={status.channelUrl}
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  {t("waitlist-open-channel")}
                </a>
              )}
            </>
          )}
          {status.nextStep === "verify-channel" && status.channelUrl && (
            // The testimonial is already in. The single remaining action is the
            // `/joined` command inside the group, so the button takes them
            // there and nothing else competes for their attention.
            <a href={status.channelUrl} className={cn(buttonVariants())}>
              {t("waitlist-open-channel")}
            </a>
          )}
          {status.nextStep === "write-testimonial" && status.telegramUrl && (
            <a href={status.telegramUrl} className={cn(buttonVariants())}>
              {t("waitlist-open-telegram")}
            </a>
          )}
          <Button
            variant="ghost"
            onClick={check}
            loading={checking}
            disabled={checking}
          >
            {t("waitlist-check")}
          </Button>
        </div>

        {notice && (
          <p
            ref={noticeRef}
            role="alert"
            tabIndex={-1}
            className="text-rust text-sm focus:outline-none"
          >
            {notice}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <p className="text-muted-foreground text-sm">
        {t("waitlist-text")}
        {promise && ` ${t("waitlist-reward", { n: promise.premiumMonths })}`}
      </p>

      <form.Field name="name">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{t("waitlist-name")}</Label>
            <Input
              id={field.name}
              name={field.name}
              autoComplete="name"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.errors.map((error) => (
              <p
                key={error?.message}
                role="alert"
                className="text-rust text-sm"
              >
                {error?.message}
              </p>
            ))}
          </div>
        )}
      </form.Field>

      <form.Field name="phone">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{t("waitlist-phone")}</Label>
            <Input
              id={field.name}
              name={field.name}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0911 234 567"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            <p className="text-muted-foreground text-sm">
              {t("waitlist-phone-hint")}
            </p>
            {field.state.meta.errors.map((error) => (
              <p
                key={error?.message}
                role="alert"
                className="text-rust text-sm"
              >
                {error?.message ?? t("waitlist-invalid-phone")}
              </p>
            ))}
          </div>
        )}
      </form.Field>

      <form.Field name="consent">
        {(field) => (
          <div className="flex items-start gap-3">
            <Checkbox
              id={field.name}
              checked={field.state.value}
              onBlur={field.handleBlur}
              onCheckedChange={(checked) =>
                field.handleChange(checked === true)
              }
            />
            <div className="space-y-1">
              <Label htmlFor={field.name} className="font-normal leading-snug">
                {t("waitlist-consent")}
              </Label>
              {/* The notice is the actual basis for this checkbox, so it has to
                  be one tap away. A consent tick with the terms hidden behind
                  another page is not consent. */}
              <Link
                to="/privacy"
                className="inline-block text-gold text-sm underline-offset-4 hover:underline"
              >
                {t("waitlist-privacy")}
              </Link>
            </div>
          </div>
        )}
      </form.Field>

      {/* Honeypot. Hidden from humans and from assistive tech, filled in by
          bots. `tabIndex={-1}` and `aria-hidden` because a screen reader
          announcing an empty field named "website" is its own bug report. */}
      <div className="hidden" aria-hidden="true">
        <form.Field name="website">
          {(field) => (
            <input
              id={field.name}
              name={field.name}
              tabIndex={-1}
              autoComplete="off"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          )}
        </form.Field>
      </div>

      {notice && <p className="text-rust text-sm">{notice}</p>}

      <form.Subscribe
        selector={(state) => ({
          canSubmit: state.canSubmit,
          isSubmitting: state.isSubmitting,
        })}
      >
        {({ canSubmit, isSubmitting }) => (
          <Button
            type="submit"
            className="w-full justify-center"
            disabled={!canSubmit}
            loading={isSubmitting}
          >
            {isSubmitting ? t("waitlist-joining") : t("waitlist-cta")}
          </Button>
        )}
      </form.Subscribe>

      {/* Only for someone who has already signed up on this browser, so they can
          recover their place without retyping their number. The server dedupes
          on phone, so resubmitting is never harmful — this is a convenience. */}
      {knownId && (
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-center"
          onClick={check}
          loading={checking}
          disabled={checking}
        >
          {t("waitlist-check")}
        </Button>
      )}
    </form>
  );
}
