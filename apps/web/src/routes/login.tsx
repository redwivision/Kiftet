import { useState } from "react";
import ForgotPasswordForm from "@/components/forgot-password-form";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import type { Route } from "./+types/login";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Sign in — Kiftet" },
    {
      name: "description",
      content:
        "Sign in to Kiftet to speak a chapter out loud, see which ideas didn't stick, and close the gaps.",
    },
  ];
}

type View = "sign-in" | "sign-up" | "forgot";

export default function Login() {
  const [view, setView] = useState<View>("sign-in");
  const toSignIn = () => setView("sign-in");

  if (view === "forgot") {
    return <ForgotPasswordForm onBack={toSignIn} />;
  }

  return view === "sign-in" ? (
    <SignInForm
      onSwitchToSignUp={() => setView("sign-up")}
      onForgotPassword={() => setView("forgot")}
    />
  ) : (
    <SignUpForm onSwitchToSignIn={toSignIn} />
  );
}
