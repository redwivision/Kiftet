import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type ImportChunk, importTocTree } from "@/lib/textbook";
import { TocPicker, type TocStage } from "./toc-picker";

// The book from the request: 6 units, topics, and sub-topics under 1.1.
const book: ImportChunk[] = [
  {
    title: "Unit 1: Cells",
    rawText: "",
    pages: { start: 3, end: 20 },
    needsOcr: true,
    topics: [
      { path: "1.1 Cell structure", title: "Cell structure", page: 4 },
      {
        path: "1.1 · 1.1.1 The nucleus",
        title: "The nucleus",
        page: 6,
      },
      {
        path: "1.1 · 1.1.2 The cell membrane",
        title: "The cell membrane",
        page: 8,
      },
      { path: "1.2 Cell division", title: "Cell division", page: 12 },
    ],
  },
  {
    title: "Unit 2: Plants",
    rawText: "",
    pages: { start: 20, end: 55 },
    needsOcr: true,
    topics: [
      {
        path: "2.1 Characteristics of plants",
        title: "Characteristics of plants",
        page: 21,
      },
    ],
  },
  ...[
    "3: Biochemical Molecules",
    "4: Cell Reproduction",
    "5: Human Biology",
    "6: Ecological Interaction",
  ].map((name, i) => ({
    title: `Unit ${name}`,
    rawText: "",
    pages: { start: 55 + i * 30, end: 85 + i * 30 },
    needsOcr: true,
  })),
];

const toc = importTocTree(book);

function render(
  selection: string[] = [],
  stage: TocStage = "queued",
  isImported: (node: { chunkIndexes?: number[] }) => boolean = () => false,
) {
  return renderToStaticMarkup(
    <TocPicker
      toc={toc}
      selection={new Set(selection)}
      onToggle={() => {}}
      onSelectAll={() => {}}
      onClear={() => {}}
      stageFor={() => stage}
      isImported={isImported as never}
      importing={false}
    />,
  );
}

/** The checklist panel on its own, so tab counts do not bleed into each other. */
function checklist(html: string) {
  return html.slice(
    html.indexOf('id="toc-panel-checklist"'),
    html.indexOf('id="toc-panel-contents"'),
  );
}

/** The checkbox with this aria-label. React emits `checked` last, hence the regex. */
function box(html: string, label: string) {
  return new RegExp(
    `<input type="checkbox"[^>]*aria-label="${label}"[^>]*/`,
  ).exec(html)?.[0];
}

test("the checklist shows all 6 units, one row each", () => {
  const html = render();
  for (let unit = 1; unit <= 6; unit += 1) {
    expect(html).toContain(`Unit ${unit}`);
  }
  // A 6-unit book is 6 rows on this tab — the topics are counted, not listed.
  // Counted within the panel: the contents tab ships its own 11 checkboxes, and
  // the claim being tested here is about this tab alone.
  expect(checklist(html).match(/type="checkbox"/g)?.length).toBe(6);
});

test("the checklist says what is inside a unit without listing it", () => {
  const rows = checklist(render());
  expect(rows).toContain("4 inside");
  expect(rows).toContain("1 inside");
  expect(rows).toContain("No topics listed under this unit");
  // The sub-topics are not on this tab at all.
  expect(rows).not.toContain("The nucleus");
});

test("both views are offered, and the contents one is the book's own numbering", () => {
  const html = render();
  expect(html).toContain('role="tablist"');
  expect(html).toContain("Checklist");
  expect(html).toContain("Contents");
  // Both panels ship in the markup — a tab that hid its content outright would
  // make the tree untestable and unlinkable, and would lose the selection state.
  expect(html).toContain('id="toc-panel-contents"');
  expect(html).toContain('aria-label="Table of contents"');
});

test("the contents nests exactly as the TOC does: Unit > 1.1 > 1.1.1", () => {
  const html = render();
  expect(html).toContain("Cell structure");
  expect(html).toContain("The nucleus");
  expect(html).toContain("The cell membrane");
  expect(html).toContain("Cell division");
  // Each level's number sits in its own column, and the sub-topic is indented one
  // step past its parent. Between "Cell structure" and "The nucleus" there is a
  // deeper padding-left — that is the nesting made visible.
  const structureAt = html.indexOf("Cell structure");
  const nucleusAt = html.indexOf("The nucleus");
  expect(nucleusAt).toBeGreaterThan(structureAt);
  const indentBefore = (at: number) =>
    Number(/padding-left:(\d+)px/.exec(html.slice(at - 400, at))?.[1] ?? -1);
  expect(indentBefore(nucleusAt)).toBeGreaterThan(indentBefore(structureAt));
  expect(html).toContain(">1.1.1<");
  expect(html).toContain(">Unit 1<");
});

test("units open by default so a 6-unit book is not 6 closed rows", () => {
  const html = render();
  // Every branch that has children starts expanded — the two units with topics
  // in this book — so the whole numbering is on screen without a click.
  expect(html.match(/aria-expanded="true"/g)?.length).toBe(3);
  expect(html).toContain("Expand all");
  expect(html).toContain("Collapse all");
});

test("a topic with a page range is tickable; one without is not", () => {
  const noPages = importTocTree([
    {
      title: "Unit 1: Cells",
      rawText: "",
      pages: { start: 3, end: 20 },
      topics: [
        { path: "1.1 Cell structure", title: "Cell structure", page: null },
      ],
    },
  ]);
  const html = renderToStaticMarkup(
    <TocPicker
      toc={noPages}
      selection={new Set()}
      onToggle={() => {}}
      onSelectAll={() => {}}
      onClear={() => {}}
      stageFor={() => "queued"}
      isImported={() => false}
      importing={false}
    />,
  );
  // Disabled on the line the book gave no page for, enabled on the unit.
  expect(box(html, "Select 1.1 Cell structure")).toContain('disabled=""');
  expect(box(html, "Select Unit 1: Cells")).not.toContain('disabled=""');
});

test("a ticked topic is shown as picked in both views at once", () => {
  const nucleus = toc[0]?.children[0]?.children[0];
  const html = render([nucleus?.id ?? ""]);
  // The count line reads from the same selection the tabs share, so ticking a
  // sub-topic reports 1 of 11 — not "1 unit of 6".
  expect(html).toContain("1 of 11 entries picked");
  // The sub-topic exists on the contents tab only, so its tick is the one that
  // appears; "both views" is about the shared state, not a duplicated control.
  expect(html.match(/checked=""/g)?.length).toBe(1);
});

test("an empty selection says how much the book holds", () => {
  expect(render()).toContain("11 entries in this book");
});

test("a book with no contents says so instead of rendering nothing", () => {
  const html = renderToStaticMarkup(
    <TocPicker
      toc={[]}
      selection={new Set()}
      onToggle={() => {}}
      onSelectAll={() => {}}
      onClear={() => {}}
      stageFor={() => "queued"}
      isImported={() => false}
      importing={false}
    />,
  );
  expect(html).toContain("No contents were found in this book.");
});

test("a failed line offers a retry", () => {
  const html = render([], "error");
  expect(html).toContain("Failed");
  expect(html).toContain("Try again");
});

test("a unit already in the library is ticked for the student, not hidden", () => {
  const html = render([], "skip", (node) => Boolean(node.chunkIndexes));
  expect(html).toContain("Already here");
  // Ticked and disabled: it is on the shelf, so it stays visible and checked but
  // cannot be queued a second time.
  const unit = box(html, "Select Unit 1: Cells") ?? "";
  expect(unit).toContain('checked=""');
  expect(unit).toContain('disabled=""');
});
