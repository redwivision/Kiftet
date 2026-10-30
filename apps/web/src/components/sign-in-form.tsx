import { Button } from "@kiftet/ui/components/button";
import { Input } from "@kiftet/ui/components/input";
import { Label } from "@kiftet/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { clearDemoUser } from "@/lib/demo";
import { verificationOutcome } from "@/lib/verification-status";

import AuthShell from "./auth-shell";
import { useLanguage } from "./language-provider";
import Loader from "./loader";
import SocialButtons from "./social-buttons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function SignInForm({
  onSwitchToSignUp,
  onForgotPassword,
}: {
  onSwitchToSignUp: () => void;
  onForgotPassword: () => void;
}) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isPending } = authClient.useSession();
  const [searchParams] = useSearchParams();
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const justSignedUp =
    searchParams.get("signup") === "1" ||
    searchParams.get("justsignedup") === "1";
  const verification = verificationOutcome(searchParams);
  const verifiedToastShown = useRef(false);

  useEffect(() => {
    if (!verification || verifiedToastShown.current) return;
    verifiedToastShown.current = true;
    if (verification === "success") {
      toast.success(t("auth-email-verified"));
    } else {
      toast.error(t("auth-email-verify-failed"));
    }
  }, [verification, t]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
          callbackURL: `${window.location.origin}/login?verified=1`,
        },
        {
          onSuccess: () => {
            clearDemoUser();
            navigate("/dashboard");
            toast.success(t("auth-welcome-back"));
          },
          onError: (error) => {
            toast.error(
              error.error?.code === "EMAIL_NOT_VERIFIED"
                ? t("auth-email-not-verified")
                : error.error?.message ||
                    error.error?.statusText ||
                    t("auth-signin-error"),
            );
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email(t("auth-invalid-email")),
        password: z.string().min(8, t("auth-password-too-short")),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <AuthShell
      title={t("auth-welcome-back")}
      subtitle={t("auth-signin-subtitle")}
      footer={
        <Button
          variant="link"
          onClick={onSwitchToSignUp}
          className="text-gold transition-colors duration-200 hover:text-gold-soft"
        >
          {t("need-account")} {t("sign-up")}
        </Button>
      }
    >
      {justSignedUp && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-gold/40 bg-panel/90 p-3">
          <img
            src="/logo-mark.png"
            alt=""
            className="size-10 rounded-xl bg-[#0A0B0D] ring-1 ring-gold/40"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">Install Kiftet</p>
            <p className="text-muted-foreground text-xs">
              Add to home screen for faster access
            </p>
          </div>
          {deferredPrompt ? (
            <Button size="sm" onClick={handleInstall} type="button">
              <Download className="size-3.5" />
              Install
            </Button>
          ) : (
            <Button size="sm" variant="outline" type="button">
              Install
            </Button>
          )}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>{t("auth-email-label")}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-rust text-sm">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>{t("auth-password-label")}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="current-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-rust text-sm">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <Button
          variant="link"
          onClick={onForgotPassword}
          className="px-0 text-mist transition-colors duration-200 hover:text-gold"
        >
          {t("auth-forgot-password")}
        </Button>

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
              {t("auth-signin-cta")}
            </Button>
          )}
        </form.Subscribe>
      </form>
      {/* Password stays the only path that needs nothing configured; these
          render only when the server says a provider is live. */}
      <SocialButtons />
    </AuthShell>
  );
}
