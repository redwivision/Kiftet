import { Button } from "@kiftet/ui/components/button";
import { Input } from "@kiftet/ui/components/input";
import { Label } from "@kiftet/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { clearDemoUser } from "@/lib/demo";

import AuthShell from "./auth-shell";
import { useLanguage } from "./language-provider";
import Loader from "./loader";
import SocialButtons from "./social-buttons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function SignUpForm({
  onSwitchToSignIn,
}: {
  onSwitchToSignIn: () => void;
}) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isPending } = authClient.useSession();
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<
    string | null
  >(null);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [justSignedUp, setJustSignedUp] = useState(false);

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
      name: "",
    },
    onSubmit: async ({ value }) => {
      const { data, error } = await authClient.signUp.email({
        email: value.email,
        password: value.password,
        name: value.name,
        // Absolute, and on the web origin: better-auth checks callbackURL
        // against trusted origins, so a bare "/login" would be rejected on
        // every origin but one.
        callbackURL: `${window.location.origin}/login`,
      });

      if (error) {
        toast.error(
          error.message ||
            error.statusText ||
            "Couldn't create your account right now. Try again.",
        );
        return;
      }

      clearDemoUser();

      // A null token is how better-auth says "no session": with verification
      // required it withholds one and returns token: null. There is no
      // requireVerification field on this response — checking that field would
      // silently never fire. Going to the dashboard without a session just
      // bounces back to sign-in with nothing explained.
      if (data.token === null) {
        setAwaitingConfirmation(value.email);
        return;
      }

      setJustSignedUp(true);
      navigate("/dashboard?justsignedup=1");
      toast.success(t("auth-account-created"));
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.email(t("auth-invalid-email")),
        password: z.string().min(8, t("auth-password-too-short")),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  if (awaitingConfirmation !== null) {
    return (
      <AuthShell
        title={t("auth-check-email-title")}
        subtitle={t("auth-signup-subtitle")}
      >
        <p className="text-mist text-sm">
          {t("auth-check-email-body", { email: awaitingConfirmation })}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth-open-room")}
      subtitle={t("auth-signup-subtitle")}
      footer={
        <Button
          variant="link"
          onClick={onSwitchToSignIn}
          className="text-gold transition-colors duration-200 hover:text-gold-soft"
        >
          {t("have-account")} {t("sign-in")}
        </Button>
      }
    >
      {justSignedUp && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-gold/40 bg-panel/90 p-3">
          <img
            src="/logo-mark.png"
            alt=""
            className="size-10 rounded-xl ring-1 ring-gold/40 bg-[#0A0B0D]"
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
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>{t("auth-name-label")}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  autoComplete="name"
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
                  autoComplete="new-password"
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
              {t("auth-signup-cta")}
            </Button>
          )}
        </form.Subscribe>
      </form>
      <SocialButtons />
    </AuthShell>
  );
}
