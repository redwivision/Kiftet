import { Button } from "@kiftet/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kiftet/ui/components/dropdown-menu";
import { Skeleton } from "@kiftet/ui/components/skeleton";
import { User } from "lucide-react";
import { Link, useNavigate } from "react-router";

import { useLanguage } from "@/components/language-provider";
import { authClient } from "@/lib/auth-client";
import { clearDemoUser } from "@/lib/demo";

export default function UserMenu() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    // Sized to match the trigger it stands in for, at both widths — a 24rem
    // placeholder is wider than the real control on a phone and is what made
    // the header jump once the session resolved.
    return (
      <Skeleton className="size-10 shrink-0 rounded-full sm:h-9 sm:w-24" />
    );
  }

  if (!session) {
    // render={...} rather than wrapping the Button in a <Link>: nesting a
    // <button> inside an <a> is invalid and leaves two tab stops for one
    // action. This hands the link to the button so it renders as one control.
    //
    // Two of them because the header has room for exactly one text button below
    // `sm`, and the waitlist is the offer that can expire — so Sign In yields
    // its label for the width while `aria-label` keeps the meaning.
    return (
      <>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("sign-in")}
          className="sm:hidden"
          render={<Link to="/login" />}
        >
          <User />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          render={<Link to="/login" />}
        >
          {t("sign-in")}
        </Button>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          // The name is the widest thing in the header and it is user-supplied,
          // so it is the part that has to yield: an icon below sm, and a
          // truncated name above it. The shared Button is nowrap by default, so
          // without max-w + truncate a long name pushes the nav off the row
          // instead of shortening.
          <Button
            variant="outline"
            size="icon"
            aria-label={t("my-account")}
            className="sm:h-9 sm:w-auto sm:gap-1.5 sm:px-4 sm:text-sm"
          />
        }
      >
        <User className="size-4 shrink-0 sm:hidden" aria-hidden="true" />
        <span className="hidden max-w-32 truncate sm:inline">
          {session.user.name}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        // Not w-full of a 40px icon trigger: on a phone the anchor is narrower
        // than the address it has to show, so the panel sets its own floor and
        // stays inside the viewport when the address is long.
        className="w-auto min-w-56 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("my-account")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="block truncate">
            {session.user.email}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    // Signing out has to drop the demo identity too. The auth
                    // middleware honours X-Demo-User-Id *before* a real session,
                    // so a demo id left in localStorage keeps re-granting a
                    // study room after sign-out and the student lands back in
                    // the demo instead of being signed out. Sign-in and sign-up
                    // already clear it; this was the one path that didn't.
                    clearDemoUser();
                    navigate("/");
                  },
                },
              });
            }}
          >
            {t("sign-out")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
