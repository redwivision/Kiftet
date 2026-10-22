import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlacementBook } from "@/lib/placement";
import {
  DayLengthPicker,
  ExamDatePicker,
  PositionPicker,
  ReviewPreferencePicker,
} from "./placement-picker";

// A book as the server reports it: two chapters, and the first one carries the
// book's own printed sections.
const books: PlacementBook[] = [
  {
    id: "book-1",
    title: "Biology Grade 12",
    subject: "Biology",
    currentChapterId: null,
    currentTopicPath: null,
    chapters: [
      {
        id: "ch-1",
        title: "Unit 1: Cells",
        topics: [
          { path: "1.1", title: "Cell structure", page: 4 },
          { path: "1.2", title: "Cell division", page: 12 },
        ],
      },
      {
        id: "ch-2",
        title: "Unit 2: Plants",
        topics: [],
      },
    ],
  },
];

function position(
  props: Partial<React.ComponentProps<typeof PositionPicker>> = {},
) {
  return renderToStaticMarkup(
    <PositionPicker
      books={books}
      bookId="book-1"
      chapterId="ch-1"
      topicPath={null}
      idPrefix="placement"
      onChange={() => {}}
      {...props}
    />,
  );
}

test("the chapter list is the book's own, and the section list is the book's own lines", () => {
  const html = position();
  expect(html).toContain("Unit 1: Cells");
  expect(html).toContain("Unit 2: Plants");
  // The section is the book's own printed path, not our own numbering.
  expect(html).toContain(">1.1<");
  expect(html).toContain(">1.2<");
});

test("a chapter with no printed sections offers no section", () => {
  // A book read from a manual page range has no sections to choose from. The
  // select is absent rather than empty: a choice the book cannot back is
  // worse than no choice.
  const html = position({ chapterId: "ch-2" });
  expect(html).toContain("Unit 2: Plants");
  expect(html).not.toContain(">1.1<");
});

test("one book means no book select", () => {
  // A student with a single book has nothing to choose between, so the
  // control is not offered at all.
  expect(position()).not.toContain('id="placement-book"');
  const secondBook: PlacementBook = {
    id: "book-2",
    title: "Economics Grade 12",
    subject: "Economics",
    currentChapterId: null,
    currentTopicPath: null,
    chapters: [],
  };
  const twoBooks = position({ books: [...books, secondBook] });
  expect(twoBooks).toContain('id="placement-book"');
  expect(twoBooks).toContain("Economics Grade 12");
});

test("the review choice shows the promise, not just the word", () => {
  const html = renderToStaticMarkup(
    <ReviewPreferencePicker value="none" onChange={() => {}} />,
  );
  // "None" and "Heavy" mean different things, and a dropdown hides that
  // behind one word. Each option states what it will do.
  expect(html).toContain("Only new material");
  expect(html).toContain("A little of what is nearly forgotten");
  expect(html).toContain("A real review block");
  // The chosen one is the one that is pressed.
  expect(html).toContain('aria-pressed="true"');
});

test("twenty minutes is the default, and it is a default", () => {
  const html = renderToStaticMarkup(
    <DayLengthPicker value={20} onChange={() => {}} idPrefix="placement" />,
  );
  // The default is offered among the options, and the student's own value is
  // the selected one — so changing it is one tap, not a form.
  expect(html).toContain("20 minutes");
  expect(html).toContain("45 minutes");
  expect(html).toContain('value="20" selected');
});

test("the exam date is optional and empty until it is given", () => {
  const html = renderToStaticMarkup(
    <ExamDatePicker value={null} onChange={() => {}} idPrefix="placement" />,
  );
  expect(html).toContain('type="date"');
  expect(html).toContain('value=""');
});
