import { Button } from "@kiftet/ui/components/button";
import { Input } from "@kiftet/ui/components/input";
import { Label } from "@kiftet/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { clearDemoUser } from "@/lib/demo";

import AuthShell from "./auth-shell";
import { useLanguage } from "./language-provider";
import Loader from "./loader";
import SocialButtons from "./social-buttons";

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

      navigate("/dashboard");
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
