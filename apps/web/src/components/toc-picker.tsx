import { Button } from "@kiftet/ui/components/button";
import { cn } from "@kiftet/ui/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import {
  type ImportTocNode,
  indexToc,
  isSelectableTopic,
  numberDepth,
  splitTocNumber,
  type TocIndex,
  tocJobs,
} from "@/lib/textbook";

/** How one line of the book is doing in the import. */
export type TocStage =
  | "skip"
  | "queued"
  | "reading"
  | "ingesting"
  | "done"
  | "error";

type ViewProps = {
  toc: ImportTocNode[];
  index: TocIndex;
  selection: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  stageFor: (node: ImportTocNode) => TocStage;
  isImported: (node: ImportTocNode) => boolean;
  importing: boolean;
  onRetry?: (nodeId: string) => void;
  ocrProgress?: { done: number; total: number } | null;
};

export type TocPickerProps = Omit<ViewProps, "index"> & {
  onSelectAll: () => void;
  onClear: () => void;
  className?: string;
};

type View = "checklist" | "contents";

/** Every id in the tree, units and topics alike, for Expand All. */
function allIds(nodes: ImportTocNode[]): string[] {
  return nodes.flatMap((node) => [node.id, ...allIds(node.children)]);
}

/**
 * Two readings of one book, over one selection.
 *
 * The checklist answers "what am I about to study?". Every unit is on screen at
 * once, one row each, with a count of what sits inside it — so a 6-unit textbook
 * is 6 rows, and the student decides in a single pass without expanding anything.
 *
 * The contents answer "how is this book actually organised?", and they are the
 * only view that can be *wrong* in a way the checklist cannot: it claims to be
 * the table of contents, so a topic shown under the wrong parent, or at the
 * wrong depth, is a visible mistake rather than a silent one.
 *
 * Two details make it read like a contents page rather than a nested list:
 *
 *  - the number is split out of the title into its own column, so `2.1` and
 *    `2.3.1` align on the left and every title starts at the same x. A student
 *    reads a contents page by scanning that column.
 *  - the depth comes from the printed number, not the nesting alone, so a book
 *    that prints `1.1.1` with no `1.1` still shows it at level three.
 *
 * The two share `selection`, so a unit ticked on one is ticked on the other.
 * That is the point of two views over one state rather than two features.
 */
export function TocPicker({
  toc,
  selection,
  onToggle,
  stageFor,
  isImported,
  importing,
  onSelectAll,
  onClear,
  onRetry,
  ocrProgress,
  className,
}: TocPickerProps) {
  const { t } = useLanguage();
  const [view, setView] = useState<View>("checklist");
  const index = useMemo(() => indexToc(toc), [toc]);
  const jobs = useMemo(() => tocJobs(toc, selection), [toc, selection]);

  const tabs = [
    ["checklist", t("toc-tab-checklist"), t("toc-tab-checklist-hint")],
    ["contents", t("toc-tab-contents"), t("toc-tab-contents-hint")],
  ] as const;

  const shared: ViewProps = {
    toc,
    index,
    selection,
    onToggle,
    stageFor,
    isImported,
    importing,
    onRetry,
    ocrProgress,
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-card/40 p-3 sm:p-4",
        className,
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-border/60 border-b pb-3">
        <div>
          <p className="font-medium text-sm">{t("choose-from-toc")}</p>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {jobs.length === 0
              ? t("toc-nothing-picked", { total: index.total })
              : t("toc-picked-summary", {
                  picked: jobs.length,
                  total: index.total,
                })}
          </p>
        </div>
        {!importing && (
          <div className="flex gap-2">
            <Button variant="ghost" size="xs" onClick={onSelectAll}>
              {t("select-available")}
            </Button>
            <Button variant="ghost" size="xs" onClick={onClear}>
              {t("clear-selection")}
            </Button>
          </div>
        )}
      </div>

      <div
        role="tablist"
        aria-label={t("toc-view-label")}
        className="mb-3 inline-flex rounded-full border border-border/70 bg-muted/30 p-0.5"
      >
        {tabs.map(([key, label, hint]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`toc-tab-${key}`}
            aria-selected={view === key}
            aria-controls={`toc-panel-${key}`}
            title={hint}
            onClick={() => setView(key)}
            className={cn(
              "rounded-full px-3 py-1.5 font-medium text-[0.78rem] transition-colors",
              view === key
                ? "bg-gold text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {toc.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          {t("toc-empty")}
        </p>
      ) : (
        <>
          <div
            role="tabpanel"
            id="toc-panel-checklist"
            aria-labelledby="toc-tab-checklist"
            hidden={view !== "checklist"}
          >
            <ChecklistView {...shared} />
          </div>
          <div
            role="tabpanel"
            id="toc-panel-contents"
            aria-labelledby="toc-tab-contents"
            hidden={view !== "contents"}
          >
            <ContentsView {...shared} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Every unit, all at once, in the order the book teaches them.
 *
 * The row count is the unit count and not the entry count — a 6-unit textbook
 * shows 6 rows. What each unit holds is a number on the row, so the book can
 * carry 59 topics without the screen carrying 59 rows. That number counts the
 * sub-topics too: a unit with two topics and five sub-topics reads as seven.
 */
function ChecklistView({
  toc,
  selection,
  onToggle,
  stageFor,
  isImported,
  importing,
  onRetry,
  ocrProgress,
}: ViewProps) {
  const { t } = useLanguage();
  const index = useMemo(() => indexToc(toc), [toc]);

  return (
    <ul className="space-y-1">
      {toc.map((node) => (
        <li
          key={node.id}
          className="rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
        >
          <UnitRow
            node={node}
            ordinal={String(toc.indexOf(node) + 1).padStart(2, "0")}
            checked={selection.has(node.id) || isImported(node)}
            inside={index.descendants.get(node.id) ?? 0}
            onToggle={onToggle}
            stage={stageFor(node)}
            imported={isImported(node)}
            importing={importing}
            onRetry={onRetry}
            ocrProgress={ocrProgress}
            noTopicsLabel={t("toc-no-topics")}
            insideLabel={(n) => t("toc-inside", { n })}
          />
        </li>
      ))}
    </ul>
  );
}

/** One unit on the checklist: its number, its title, and what is inside it. */
function UnitRow({
  node,
  ordinal,
  checked,
  inside,
  onToggle,
  stage,
  imported,
  importing,
  onRetry,
  ocrProgress,
  noTopicsLabel,
  insideLabel,
}: {
  node: ImportTocNode;
  ordinal: string;
  checked: boolean;
  inside: number;
  onToggle: (id: string, checked: boolean) => void;
  stage: TocStage;
  imported: boolean;
  importing: boolean;
  onRetry?: (nodeId: string) => void;
  ocrProgress?: { done: number; total: number } | null;
  noTopicsLabel: string;
  insideLabel: (n: number) => string;
}) {
  const { t } = useLanguage();
  const { number, label } = splitTocNumber(node.title);
  return (
    <div className="flex items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 size-4 shrink-0 accent-gold"
        checked={checked}
        disabled={imported || importing}
        onChange={(event) => onToggle(node.id, event.currentTarget.checked)}
        aria-label={t("select-chapter", { title: node.title })}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm leading-6">
          <span className="mr-2 font-mono text-[0.7rem] text-gold tabular-nums">
            {number ?? ordinal}
          </span>
          {label}
        </p>
        <p className="text-muted-foreground text-xs">
          {inside > 0 ? insideLabel(inside) : noTopicsLabel}
        </p>
      </div>
      <StageBadge
        stage={stage}
        imported={imported}
        importing={importing}
        onRetry={stage === "error" ? () => onRetry?.(node.id) : undefined}
        ocrProgress={ocrProgress}
      />
    </div>
  );
}

/**
 * The book, as the contents page writes it.
 *
 * Expansion defaults to fully open, because this tab is a contents page and a
 * contents page does not arrive folded: a student opening it to check how the
 * book is organised has to see 1.1.1 sitting under 1.1, not infer it from a
 * chevron. Collapse All is one click away for the long book.
 */
function ContentsView({
  toc,
  index,
  selection,
  onToggle,
  stageFor,
  isImported,
  importing,
  onRetry,
  ocrProgress,
}: ViewProps) {
  const { t } = useLanguage();
  // Everything starts open: the whole tree, so the printed numbering and the
  // nesting it implies are both visible without a single click.
  const [open, setOpen] = useState<Set<string>>(() => new Set(allIds(toc)));

  const toggleOpen = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setOpen(new Set(allIds(toc)))}
        >
          {t("toc-expand-all")}
        </Button>
        <Button variant="ghost" size="xs" onClick={() => setOpen(new Set())}>
          {t("toc-collapse-all")}
        </Button>
      </div>
      <ul className="space-y-0.5" aria-label={t("toc-tree-label")}>
        {toc.map((node) => (
          <ContentsNode
            key={node.id}
            node={node}
            depth={0}
            index={index}
            open={open}
            onToggleOpen={toggleOpen}
            selection={selection}
            onToggle={onToggle}
            stageFor={stageFor}
            isImported={isImported}
            importing={importing}
            onRetry={onRetry}
            ocrProgress={ocrProgress}
          />
        ))}
      </ul>
    </div>
  );
}

function ContentsNode({
  node,
  depth,
  index,
  open,
  onToggleOpen,
  ...rest
}: {
  node: ImportTocNode;
  depth: number;
  index: TocIndex;
  open: Set<string>;
  onToggleOpen: (id: string) => void;
} & Omit<ViewProps, "toc" | "index">) {
  const {
    selection,
    onToggle,
    stageFor,
    isImported,
    importing,
    onRetry,
    ocrProgress,
  } = rest;
  const { t } = useLanguage();
  const { number, label } = splitTocNumber(node.title);
  // A line's place in the contents is its printed number's depth. Where the book
  // never numbered a line, its position in the tree is the best answer left.
  const level = Math.max(numberDepth(node.title), depth + 1);
  const isUnit = Boolean(node.chunkIndexes);
  const isOpen = open.has(node.id);
  const hasChildren = node.children.length > 0;
  const inside = index.descendants.get(node.id) ?? 0;
  const stage = stageFor(node);
  const imported = isImported(node);
  // A line already on the shelf reads as ticked in both views: the student asked
  // for this once and got it, and a box that empties itself while saying "Already
  // here" beside it looks like the app lost track of what it did.
  const checked = selection.has(node.id) || imported;
  // A topic can only be picked when the book gave it a page to start on.
  // Otherwise the checkbox is shown but dead, which is the honest state: we know
  // the line exists, and we do not know where it begins.
  const pickable = isUnit || isSelectableTopic(node);

  return (
    // Depth is read from the DOM nesting and from the number sitting in its own
    // column, which a screen reader announces in order: "Expand Cells", "Select
    // Unit 1: Cells", "Unit 1", "Cells". An aria-level here would be invalid on a
    // list item, and the number already says which level the book meant.
    <li
      className={cn(
        "rounded-md transition-colors",
        checked ? "bg-gold/[0.07]" : "hover:bg-muted/30",
      )}
    >
      <div
        className="flex items-start gap-2 py-1"
        style={{ paddingLeft: `${(level - 1) * 14}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleOpen(node.id)}
            aria-expanded={isOpen}
            aria-label={
              isOpen
                ? t("toc-collapse", { title: label })
                : t("toc-expand", { title: label })
            }
            className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            {isOpen ? (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-3.5" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span aria-hidden="true" className="mt-0.5 w-4 shrink-0" />
        )}

        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-gold"
          checked={checked}
          disabled={(!pickable && !checked) || importing || imported}
          onChange={(event) => onToggle(node.id, event.currentTarget.checked)}
          aria-label={t("select-chapter", { title: node.title })}
        />

        {/* The number, in its own column. This is what makes it a contents page. */}
        <span
          className={cn(
            "mt-px w-16 shrink-0 text-right font-mono text-[0.7rem] tabular-nums",
            isUnit ? "text-gold" : "text-muted-foreground",
          )}
        >
          {number ?? ""}
        </span>

        <span
          className={cn(
            "min-w-0 flex-1 text-sm leading-6",
            isUnit ? "font-medium" : "text-muted-foreground",
          )}
        >
          {label}
          {hasChildren && (
            <span className="ml-2 text-[0.7rem] text-muted-foreground/70">
              {t("toc-inside", { n: inside })}
            </span>
          )}
        </span>

        <StageBadge
          stage={stage}
          imported={imported}
          importing={importing}
          onRetry={stage === "error" ? () => onRetry?.(node.id) : undefined}
          ocrProgress={ocrProgress}
        />
      </div>

      {hasChildren && isOpen && (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <ContentsNode
              key={child.id}
              node={child}
              depth={depth + 1}
              index={index}
              open={open}
              onToggleOpen={onToggleOpen}
              {...rest}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function StageBadge({
  stage,
  imported,
  importing,
  onRetry,
  ocrProgress,
}: {
  stage: TocStage;
  imported: boolean;
  importing: boolean;
  onRetry?: () => void;
  ocrProgress?: { done: number; total: number } | null;
}) {
  const { t } = useLanguage();
  if (stage === "error") {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full border border-rust/40 bg-rust/10 px-2.5 py-1 font-medium text-[0.78rem] text-rust">
          {t("failed")}
        </span>
        {!importing && onRetry && (
          <Button variant="outline" size="xs" onClick={onRetry}>
            {t("retry")}
          </Button>
        )}
      </div>
    );
  }
  if (stage === "done" || (imported && stage === "skip")) {
    return (
      <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.78rem] text-gold">
        {importing ? t("already-in") : t("already-here")}
      </span>
    );
  }
  if (stage === "skip") {
    return (
      <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-[0.78rem] text-muted-foreground">
        {t("landed")}
      </span>
    );
  }
  if (stage === "reading") {
    return (
      <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.78rem] text-gold">
        {ocrProgress && ocrProgress.total > 0
          ? t("ocr-reading-page", ocrProgress)
          : t("ocr-read-chapter")}
      </span>
    );
  }
  if (stage === "ingesting") {
    return (
      <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-medium text-[0.78rem] text-gold">
        {t("building-checklist")}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-[0.78rem] text-muted-foreground">
      {t("new-label")}
    </span>
  );
}
