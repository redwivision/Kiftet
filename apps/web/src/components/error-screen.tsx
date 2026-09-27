import { Button } from "@kiftet/ui/components/button";
import { isRouteErrorResponse } from "react-router";
import { BrandMark } from "@/components/brand-mark";
import { useLanguage } from "@/components/language-provider";

type Kind = "not-found" | "connection" | "broken";

function classify(error: unknown): Kind {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) return "not-found";
    // A failed lazy chunk over a bad connection surfaces as a thrown Error,
    // not a response, so check for that shape too before blaming the server.
    if (error.status === 503 || error.status === 504) return "connection";
    return "broken";
  }
  const message = error instanceof Error ? error.message : "";
  if (
    /dynamically imported module|Failed to fetch|Importing a module script failed|Loading chunk/i.test(
      message,
    )
  ) {
    return "connection";
  }
  return "broken";
}

function technicalDetail(error: unknown): string | undefined {
  if (isRouteErrorResponse(error)) {
    return [error.status, error.statusText].filter(Boolean).join(" · ");
  }
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return undefined;
}

/**
 * The screen a student sees when a route fails.
 *
 * A broken page is an unclosed gap, so this screen speaks the product's own
 * language instead of shipping a framework's default: the mark, the ink
 * settling, an honest sentence about what happened, and two obvious ways out.
 * It is also the one moment a user is already frustrated, so it must not look
 * like a broken dev server — no raw stack on the surface, no "Oops!".
 *
 * Nothing here is destructive: a reload is always safe because every write in
 * Kiftet is either graded server-side already or queued in the offline outbox.
 */
export function ErrorScreen({ error }: { error: unknown }) {
  const { t } = useLanguage();
  const kind = classify(error);

  const title =
    kind === "not-found"
      ? t("err-404-title")
      : kind === "connection"
        ? t("err-offline-title")
        : t("err-500-title");
  const body =
    kind === "not-found"
      ? t("err-404-body")
      : kind === "connection"
        ? t("err-offline-body")
        : t("err-500-body");

  // The technical detail is real information, but it is not the headline and
  // it is not English-shaped prose — so it goes behind a disclosure, and in
  // production it stays folded away entirely.
  const detail = technicalDetail(error);
  const showDetail = detail && import.meta.env.DEV;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-2xl flex-1 items-center justify-center px-4 py-16 sm:px-6"
    >
      <div className="surface flex w-full animate-rise-in flex-col items-center px-6 py-12 text-center sm:px-10">
        <BrandMark size={64} className="rounded-full ring-1 ring-gold/40" />

        <p className="k-label mt-6 text-[0.78rem] uppercase tracking-[0.14em]">
          {String(isRouteErrorResponse(error) ? error.status : "") || "Kiftet"}
        </p>

        <h1 className="mt-3 text-balance font-display font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
          {title}
        </h1>

        <p className="mt-4 max-w-md text-pretty text-muted-foreground leading-7">
          {body}
        </p>

        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto"
          >
            {t("retry")}
          </Button>
          <Button
            variant="outline"
            render={<a href="/" />}
            className="w-full sm:w-auto"
          >
            {t("go-home")}
          </Button>
        </div>

        {showDetail && (
          <details className="mt-8 w-full text-left">
            <summary className="k-label cursor-pointer text-[0.78rem] normal-case">
              {t("technical-details")}
            </summary>
            <pre className="read-panel mt-3 max-h-64 overflow-auto p-4 text-xs leading-5">
              <code>{detail}</code>
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}
