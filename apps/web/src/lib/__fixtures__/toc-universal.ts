// Hand-written contents pages, one per shape a real textbook uses.
//
// The generated corpus in `toc-corpus.ts` proves the reader against the three
// books in `docs/`. This one covers the shapes those three happen not to have:
// a book whose leaders did not extract, a dash-led contents, a middle dot, tabs,
// a book that never says "Unit", a contents that wraps a long title, and the
// exercise page that looks like a contents. Each case is written the way the
// extractor would hand the page over, so it runs through the exact reader the
// app runs.
//
// Every expectation is hand-checked against the page above it — a fixture that
// merely records whatever the parser happens to do would lock in a bug.

/** A topic as the fixture expects it: `path` joined on dots, e.g. "3.1.1". */
export type ExpectedTopic = { path: string; title: string; page: number };

export type ExpectedChapter = {
  unit: number;
  title: string;
  page: number;
  topics: ExpectedTopic[];
};

export type UniversalContentsCase = {
  id: string;
  /** Why this shape is in the corpus, in a sentence. */
  note: string;
  /** Front-matter pages exactly as the extractor produced them. */
  pages: string[];
  /** The tree the book is known to have, or null when it has no contents. */
  expect: ExpectedChapter[] | null;
};

export type UniversalDetectionCase = {
  id: string;
  note: string;
  text: string;
  expect: boolean;
};

export const UNIVERSAL_CONTENTS_CASES: UniversalContentsCase[] = [
  {
    id: "leaderless-english",
    note: "The commonest shape: a unit word, a colon, a title and a page, no leaders between.",
    pages: [
      "CONTENTS\nUnit 1: Numbers 1\n1.1 Counting 3\n1.2 Addition 7\nUnit 2: Shapes 12\n2.1 Circles 14\n2.2 Squares 16",
    ],
    expect: [
      {
        unit: 1,
        title: "Numbers",
        page: 1,
        topics: [
          { path: "1.1", title: "Counting", page: 3 },
          { path: "1.2", title: "Addition", page: 7 },
        ],
      },
      {
        unit: 2,
        title: "Shapes",
        page: 12,
        topics: [
          { path: "2.1", title: "Circles", page: 14 },
          { path: "2.2", title: "Squares", page: 16 },
        ],
      },
    ],
  },
  {
    id: "dash-leaders",
    note: "A book that rules its contents with dashes: a trailing single dash must not cling to the title.",
    pages: [
      "CONTENTS\nUNIT 1 – THE CELL --- 5\n1.1 Membrane --- 7\n1.2 Nucleus --- 12\nUNIT 2 – GENETICS – 20\n2.1 DNA – 22",
    ],
    expect: [
      {
        unit: 1,
        title: "THE CELL",
        page: 5,
        topics: [
          { path: "1.1", title: "Membrane", page: 7 },
          { path: "1.2", title: "Nucleus", page: 12 },
        ],
      },
      {
        unit: 2,
        title: "GENETICS",
        page: 20,
        topics: [{ path: "2.1", title: "DNA", page: 22 }],
      },
    ],
  },
  {
    id: "ellipsis-leaders",
    note: "Unicode ellipsis as the leader — one glyph or many — must be stripped from the title.",
    pages: [
      "Contents\nChapter 1 Introduction … 1\n1.1 Why 3\nChapter 2 Methods …… 9\n2.1 How 11",
    ],
    expect: [
      {
        unit: 1,
        title: "Introduction",
        page: 1,
        topics: [{ path: "1.1", title: "Why", page: 3 }],
      },
      {
        unit: 2,
        title: "Methods",
        page: 9,
        topics: [{ path: "2.1", title: "How", page: 11 }],
      },
    ],
  },
  {
    id: "middot-leaders",
    note: "A single middle dot on each side of the title, which `LEADER_RUN` deliberately does not collapse.",
    pages: [
      "CONTENTS\nUnit 1 · Matter · 1\n1.1 Atoms · 3\nUnit 2 · Energy · 9\n2.1 Heat · 11",
    ],
    expect: [
      {
        unit: 1,
        title: "Matter",
        page: 1,
        topics: [{ path: "1.1", title: "Atoms", page: 3 }],
      },
      {
        unit: 2,
        title: "Energy",
        page: 9,
        topics: [{ path: "2.1", title: "Heat", page: 11 }],
      },
    ],
  },
  {
    id: "tab-leaders",
    note: "Columns held apart by tabs rather than dots, which the extractor keeps as tab characters.",
    pages: [
      "CONTENTS\nUnit 1\tNumbers\t1\n1.1\tCounting\t3\nUnit 2\tShapes\t12\n2.1\tCircles\t14",
    ],
    expect: [
      {
        unit: 1,
        title: "Numbers",
        page: 1,
        topics: [{ path: "1.1", title: "Counting", page: 3 }],
      },
      {
        unit: 2,
        title: "Shapes",
        page: 12,
        topics: [{ path: "2.1", title: "Circles", page: 14 }],
      },
    ],
  },
  {
    id: "afaan-oromoo",
    note: "An Afaan Oromoo contents, headed Qabiyyee with Boqonnaa for its units.",
    pages: [
      "Qabiyyee\nBoqonnaa 1: Seensa 1\n1.1 Yaada 3\nBoqonnaa 2: Barnoota 9\n2.1 Barumsa 11",
    ],
    expect: [
      {
        unit: 1,
        title: "Seensa",
        page: 1,
        topics: [{ path: "1.1", title: "Yaada", page: 3 }],
      },
      {
        unit: 2,
        title: "Barnoota",
        page: 9,
        topics: [{ path: "2.1", title: "Barumsa", page: 11 }],
      },
    ],
  },
  {
    id: "amharic",
    note: "An Amharic contents whose unit word (ምዕራፍ) and titles carry no ASCII at all.",
    pages: [
      "ይዘት\nምዕራፍ 1 ስለ ትምህርት 1\n1.1 ስለ ሕይወት 3\nምዕራፍ 2 ስለ እፅዋት 9\n2.1 ስለ አበባ 11",
    ],
    expect: [
      {
        unit: 1,
        title: "ስለ ትምህርት",
        page: 1,
        topics: [{ path: "1.1", title: "ስለ ሕይወት", page: 3 }],
      },
      {
        unit: 2,
        title: "ስለ እፅዋት",
        page: 9,
        topics: [{ path: "2.1", title: "ስለ አበባ", page: 11 }],
      },
    ],
  },
  {
    id: "roman-parts",
    note: "Roman numerals for the units — Part I, Part II — which the heading scanner also accepts.",
    pages: [
      "CONTENTS\nPart I Foundations 1\n1.1 Basics 3\nPart II Applications 20\n2.1 Uses 22",
    ],
    expect: [
      {
        unit: 1,
        title: "Foundations",
        page: 1,
        topics: [{ path: "1.1", title: "Basics", page: 3 }],
      },
      {
        unit: 2,
        title: "Applications",
        page: 20,
        topics: [{ path: "2.1", title: "Uses", page: 22 }],
      },
    ],
  },
  {
    id: "bare-numbered",
    note: "A book that never says Unit or Chapter: the top-level number is the chapter.",
    pages: [
      "CONTENTS\n1 Introduction 1\n1.1 Scope 3\n1.2 Goals 5\n2 Background 9\n2.1 History 11\n3 Methods 20\n3.1 Sampling 22",
    ],
    expect: [
      {
        unit: 1,
        title: "Introduction",
        page: 1,
        topics: [
          { path: "1.1", title: "Scope", page: 3 },
          { path: "1.2", title: "Goals", page: 5 },
        ],
      },
      {
        unit: 2,
        title: "Background",
        page: 9,
        topics: [{ path: "2.1", title: "History", page: 11 }],
      },
      {
        unit: 3,
        title: "Methods",
        page: 20,
        topics: [{ path: "3.1", title: "Sampling", page: 22 }],
      },
    ],
  },
  {
    id: "wrapped-title",
    note: "A long chapter title that wraps to a second line before its page number.",
    pages: [
      "CONTENTS\nUnit 1 A Very Long Chapter Title That\nWraps 5\n1.1 Topic 7\nUnit 2 Other 20\n2.1 Second 22",
    ],
    expect: [
      {
        unit: 1,
        title: "A Very Long Chapter Title That Wraps",
        page: 5,
        topics: [{ path: "1.1", title: "Topic", page: 7 }],
      },
      {
        unit: 2,
        title: "Other",
        page: 20,
        topics: [{ path: "2.1", title: "Second", page: 22 }],
      },
    ],
  },
  {
    id: "deep-nesting",
    note: "Three levels: a unit, a section and a sub-section, whose depth is carried in the path.",
    pages: [
      "CONTENTS\nUnit 3 The Leaf 40\n3.1 External structure 41\n3.1.1 The petiole 42\n3.2 Internal structure 44",
    ],
    expect: [
      {
        unit: 3,
        title: "The Leaf",
        page: 40,
        topics: [
          { path: "3.1", title: "External structure", page: 41 },
          { path: "3.1.1", title: "The petiole", page: 42 },
          { path: "3.2", title: "Internal structure", page: 44 },
        ],
      },
    ],
  },
  {
    id: "separators-vary",
    note: "A dot after the number on one unit, a spaced hyphen on the next — both are separators.",
    pages: [
      "CONTENTS\nUnit 1. Plants 17\n1.1 Leaves 18\nUnit 2 - Animals 40\n2.1 Fish 41",
    ],
    expect: [
      {
        unit: 1,
        title: "Plants",
        page: 17,
        topics: [{ path: "1.1", title: "Leaves", page: 18 }],
      },
      {
        unit: 2,
        title: "Animals",
        page: 40,
        topics: [{ path: "2.1", title: "Fish", page: 41 }],
      },
    ],
  },
  {
    id: "back-matter-dropped",
    note: "Each unit closes with a summary and a review; both are dropped, and neither becomes a unit.",
    pages: [
      "CONTENTS\nUnit 1 Cells 1\n1.1 The membrane 2\nUnit summary 20\nUnit review exercises 22\nUnit 2 Genetics 24\n2.1 DNA 25\nUnit summary 40\nUnit review exercises 42",
    ],
    expect: [
      {
        unit: 1,
        title: "Cells",
        page: 1,
        topics: [{ path: "1.1", title: "The membrane", page: 2 }],
      },
      {
        unit: 2,
        title: "Genetics",
        page: 24,
        topics: [{ path: "2.1", title: "DNA", page: 25 }],
      },
    ],
  },
  {
    id: "multi-page-thin-tail",
    note: "A contents that runs on: the last pages list one unit each, and a thin page must not end the walk.",
    pages: [
      "Contents",
      "Unit 1 Introduction 1\n1.1 Basics 2\nUnit 2 Cells 3\n2.1 Membranes 4\nUnit 3 Genetics 5\n3.1 DNA 6\nUnit 4 Ecology 7\n4.1 Food webs 8",
      "Unit 5 Evolution 9\n5.1 Natural selection 10",
      "Unit 6 Physiology 11\n6.1 The heart 12",
      "Photosynthesis is the process by which plants convert light into chemical energy.",
    ],
    expect: [
      {
        unit: 1,
        title: "Introduction",
        page: 1,
        topics: [{ path: "1.1", title: "Basics", page: 2 }],
      },
      {
        unit: 2,
        title: "Cells",
        page: 3,
        topics: [{ path: "2.1", title: "Membranes", page: 4 }],
      },
      {
        unit: 3,
        title: "Genetics",
        page: 5,
        topics: [{ path: "3.1", title: "DNA", page: 6 }],
      },
      {
        unit: 4,
        title: "Ecology",
        page: 7,
        topics: [{ path: "4.1", title: "Food webs", page: 8 }],
      },
      {
        unit: 5,
        title: "Evolution",
        page: 9,
        topics: [{ path: "5.1", title: "Natural selection", page: 10 }],
      },
      {
        unit: 6,
        title: "Physiology",
        page: 11,
        topics: [{ path: "6.1", title: "The heart", page: 12 }],
      },
    ],
  },
  {
    id: "units-only-declines",
    note: "A contents that lists only units and no topics is declined on purpose — the tree needs topics — and the heading scan takes over.",
    pages: [
      "CONTENTS\nUnit 1 Numbers 1\nUnit 2 Shapes 10\nUnit 3 Time 20\nUnit 4 Money 30",
    ],
    expect: null,
  },
  {
    id: "exercise-page-declines",
    note: "A review page: numbered lines that each end in a number, with no leaders. It must not be read as contents.",
    pages: [
      "Exercises\n1. Define matter. 5\n2. List the states of matter. 7\n3. What is a mixture? 9\n4. Give two examples. 11",
    ],
    expect: null,
  },
  {
    id: "body-prose-declines",
    note: "A body page with no contents shape at all.",
    pages: [
      "The cell is the basic unit of life.",
      "All living things are made of cells, first seen by Robert Hooke in 1665.",
    ],
    expect: null,
  },
  {
    id: "roman-page-numbers",
    note: "Front matter numbered in roman numerals: 'Unit 1 Introduction to Biology ix'. The arabic-only tail used to refuse the unit line, so the unit was dropped and the next unit's title absorbed the orphaned topic lines.",
    pages: [
      "CONTENTS\nUnit 1 Introduction to Biology ix\n1.1 What is biology x\n1.2 Life processes xi\nUnit 2 Cells 1\n2.1 Cell structure 2\n2.2 Cell division 5",
    ],
    expect: [
      {
        unit: 1,
        title: "Introduction to Biology",
        page: 9,
        topics: [
          { path: "1.1", title: "What is biology", page: 10 },
          { path: "1.2", title: "Life processes", page: 11 },
        ],
      },
      {
        unit: 2,
        title: "Cells",
        page: 1,
        topics: [
          { path: "2.1", title: "Cell structure", page: 2 },
          { path: "2.2", title: "Cell division", page: 5 },
        ],
      },
    ],
  },
];

export const UNIVERSAL_DETECTION_CASES: UniversalDetectionCase[] = [
  {
    id: "heading-contents",
    note: "The English word is enough on its own, however it is spaced.",
    text: "Table of Contents",
    expect: true,
  },
  {
    id: "heading-ethiopic",
    note: "An Amharic contents heading, which is named rather than spelled in English.",
    text: "ይዘት",
    expect: true,
  },
  {
    id: "heading-oromo",
    note: "The Afaan Oromoo heading, matched directly rather than left to the shape test.",
    text: "Qabiyyee",
    expect: true,
  },
  {
    id: "shape-leaderless",
    note: "No English word, no leaders — numbered lines that each end in a page number.",
    text: "Kapitel 1 Einführung 1\n1.1 Grundlagen 3\n1.2 Methoden 7\nKapitel 2 Zellen 12\n2.1 Membranen 13",
    expect: true,
  },
  {
    id: "exercise-page",
    note: "An exercises page is numbered and ends in numbers, so the shape test alone would pass it; the leading word refuses it.",
    text: "Exercises\n1. Cells divide. 5\n2. Energy is stored. 7\n3. Genes are inherited. 9",
    expect: false,
  },
  {
    id: "single-unit-line",
    note: "One unit line with no page numbers is a heading, not a contents.",
    text: "Unit 2: Plants",
    expect: false,
  },
  {
    id: "contents-opening-on-a-review-entry",
    note: 'A contents page whose first line is an entry called "Review Questions" — it ends in a page number, so the back-matter guard must not refuse it.',
    text: "Review Questions 55\nUnit 4 Ecology 57\n4.1 Food webs 58\n4.2 Energy flow 60",
    expect: true,
  },
  {
    id: "prose-ending-in-roman-letters",
    note: "Body prose whose lines end in words spelled from roman letters — 'cell', 'civic' — must not read as a contents. The roman page-number form is confined to a trailing token after a title, never a suffix of a word.",
    text: "The cell\nThe smallest living unit is the cell\nEvery tissue is built from many a cell\nMitosis makes two cells from one cell",
    expect: false,
  },
];
