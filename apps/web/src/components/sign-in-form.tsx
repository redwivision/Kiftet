import { Button } from "@kiftet/ui/components/button";
import { Input } from "@kiftet/ui/components/input";
import { Label } from "@kiftet/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { clearDemoUser } from "@/lib/demo";

import AuthShell from "./auth-shell";
import { useLanguage } from "./language-provider";
import Loader from "./loader";
import SocialButtons from "./social-buttons";

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
        },
        {
          onSuccess: () => {
            clearDemoUser();
            navigate("/dashboard");
            toast.success(t("auth-welcome-back"));
          },
          onError: (error) => {
            toast.error(
              error.error?.message ||
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
