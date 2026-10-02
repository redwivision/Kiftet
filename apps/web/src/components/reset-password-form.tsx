import { Button } from "@kiftet/ui/components/button";
import { Input } from "@kiftet/ui/components/input";
import { Label } from "@kiftet/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import AuthShell from "./auth-shell";
import { useLanguage } from "./language-provider";
import Loader from "./loader";

export default function ResetPasswordForm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isPending } = authClient.useSession();
  const token = params.get("token");

  const form = useForm({
    defaultValues: { password: "" },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.resetPassword({
        newPassword: value.password,
        token: token ?? "",
      });

      // Covers both "expired" and "already used": the link stops working the
      // first time it succeeds, and a student who clicks it twice should not be
      // told which of the two happened.
      if (error) {
        toast.error(t("auth-reset-failed"));
        return;
      }
      toast.success(t("auth-reset-done"));
      navigate("/login", { replace: true });
    },
    validators: {
      onSubmit: z.object({
        password: z.string().min(8, t("auth-password-too-short")),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  if (!token) {
    return (
      <AuthShell
        title={t("auth-reset-title")}
        subtitle={t("auth-reset-subtitle")}
      >
        <p className="text-mist text-sm">{t("auth-reset-no-token")}</p>
        <Link
          to="/login"
          className="text-gold transition-colors duration-200 hover:text-gold-soft"
        >
          {t("auth-forgot-back")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth-reset-title")}
      subtitle={t("auth-reset-subtitle")}
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
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>
                  {t("auth-new-password-label")}
                </Label>
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
              {t("auth-reset-cta")}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthShell>
  );
}
