import { Button } from "@kiftet/ui/components/button";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import type { ImportDiagnostics } from "@/lib/textbook";

/**
 * What the site understood of the book, in a form a person can read and send.
 *
 * A contents tree that looks wrong is ambiguous: the book may have been read
 * wrongly, or read correctly and drawn wrongly, and the screen alone cannot say
 * which. This shows the receipt — which source produced the list, whether the
 * contents page was found and what it said, what was parsed off it, what the
 * model read when it was asked, what the heading scan found, whether the page
 * offset was trusted — with one button to copy the whole thing.
 */
export function HierarchyReport({
  report,
  className,
}: {
  report: ImportDiagnostics | null;
  className?: string;
}) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  if (!report) return null;

  const asText = [
    `file: ${report.file}`,
    `source: ${report.source}`,
    `pages: ${report.pageCount}`,
    `outline entries: ${report.outlineEntries}`,
    `audit problem: ${report.auditProblem ?? "none"}`,
    `contents page: ${report.contentsPage ?? "not found"}`,
    `contents pages read: ${report.contentsPagesRead}`,
    `page offset: ${report.pageOffset ?? "not established"}`,
    `model units: ${report.modelUnits.length || "none"}`,
    `model reader: ${report.modelRead}${
      report.modelReason ? ` — ${report.modelReason}` : ""
    }`,
    "",
    "— contents entries —",
    ...report.contentsEntries.map(
      (c) => `Unit ${c.unit}: ${c.title}  p${c.page}`,
    ),
    "",
    "— model units (PDF page indices) —",
    ...(report.modelUnits.length
      ? report.modelUnits.map(
          (m) =>
            `${[m.number, m.title].filter(Boolean).join(" ")}  pdf p${m.page}`,
        )
      : ["(none)"]),
    "",
    "— heading scan —",
    ...report.segments.map((s) => `${s.title}  ${s.start}-${s.end}`),
    "",
    "— tree shown —",
    ...report.tree,
    "",
    "— contents text as read —",
    report.contentsText || "(nothing read)",
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <details className={className}>
      <summary className="cursor-pointer text-muted-foreground text-xs">
        {t("hierarchy-report-label")}
      </summary>
      <div className="mt-2 space-y-2">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">
            {t("hierarchy-report-source")}
          </dt>
          <dd>{report.source}</dd>
          <dt className="text-muted-foreground">
            {t("hierarchy-report-contents")}
          </dt>
          <dd>
            {report.contentsPage === null
              ? t("hierarchy-report-contents-missing")
              : `${report.contentsPage} (${report.contentsPagesRead} ${t("hierarchy-report-pages")})`}
          </dd>
          <dt className="text-muted-foreground">
            {t("hierarchy-report-offset")}
          </dt>
          <dd>{report.pageOffset ?? t("hierarchy-report-none")}</dd>
          <dt className="text-muted-foreground">
            {t("hierarchy-report-model")}
          </dt>
          <dd>{report.modelUnits.length}</dd>
          <dt className="text-muted-foreground">
            {t("hierarchy-report-model-read")}
          </dt>
          <dd>
            {report.modelRead}
            {report.modelReason ? ` — ${report.modelReason}` : ""}
          </dd>
          <dt className="text-muted-foreground">
            {t("hierarchy-report-entries")}
          </dt>
          <dd>
            {report.contentsEntries.length} / {report.segments.length}
          </dd>
        </dl>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-2 text-muted-foreground text-xs">
          {report.tree.join("\n")}
        </pre>
        <Button variant="ghost" size="xs" onClick={copy}>
          {copied ? t("hierarchy-report-copied") : t("hierarchy-report-copy")}
        </Button>
      </div>
    </details>
  );
}
