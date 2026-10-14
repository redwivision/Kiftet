import { useLocation } from "react-router";

/* The routes that belong to the study room — the screens a student moves
   between with their thumb. The landing page and the auth shell are the public
   site; they keep the header's own navigation and must not grow a tab bar, so
   the mobile chrome is scoped to exactly this set. */
const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/textbooks",
  "/syllabus",
  "/study",
] as const;

export function isAppRoute(pathname: string): boolean {
  return APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function useIsAppRoute(): boolean {
  return isAppRoute(useLocation().pathname);
}
