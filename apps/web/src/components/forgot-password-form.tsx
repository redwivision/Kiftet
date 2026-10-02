import { Button } from "@kiftet/ui/components/button";
import { Input } from "@kiftet/ui/components/input";
import { Label } from "@kiftet/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import AuthShell from "./auth-shell";
import { useLanguage } from "./language-provider";
import Loader from "./loader";

/** Absolute, because better-auth checks redirectTo against trusted origins. */
function resetRedirect(): string {
  return `${window.location.origin}/reset-password`;
}

export default function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const { t } = useLanguage();
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.requestPasswordReset({
        email: value.email,
        redirectTo: resetRedirect(),
      });

      // The same message whether or not the address has an account. Anything
      // else turns this form into a way to find out who is using the app, and
      // an unverified guess is cheaper to send than to rate-limit properly.
      if (error) toast.error(t("auth-signin-error"));
      else toast.success(t("auth-forgot-sent"));
    },
    validators: {
      onSubmit: z.object({
        email: z.email(t("auth-forgot-invalid-email")),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <AuthShell
      title={t("auth-forgot-title")}
      subtitle={t("auth-forgot-subtitle")}
      footer={
        <Button
          variant="link"
          onClick={onBack}
          className="text-gold transition-colors duration-200 hover:text-gold-soft"
        >
          {t("auth-forgot-back")}
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
              {t("auth-forgot-cta")}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthShell>
  );
}
