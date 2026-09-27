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
import { Link, useNavigate } from "react-router";

import { useLanguage } from "@/components/language-provider";
import { authClient } from "@/lib/auth-client";

export default function UserMenu() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="h-11 w-24 rounded-full" />;
  }

  if (!session) {
    // render={...} rather than wrapping the Button in a <Link>: nesting a
    // <button> inside an <a> is invalid and leaves two tab stops for one
    // action. This hands the link to the button so it renders as one control.
    return (
      <Button variant="outline" size="sm" render={<Link to="/login" />}>
        {t("sign-in")}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" aria-label={t("my-account")} />
        }
      >
        {session.user.name}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("my-account")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>{session.user.email}</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
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
