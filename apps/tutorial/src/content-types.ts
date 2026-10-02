/** Shape of `virtual:tutorial-content` (built by build/content.ts). */

export type Track = "blazor" | "ts";

export type LessonFiles = Record<string, string>;

export interface LessonText {
  title: string;
  /** File opened first in the editor. */
  focus: string;
  /** Rendered lesson text (HTML, code blocks pre-highlighted). */
  html: string;
}

export interface LessonContent {
  slug: string;
  /** Content-relative directory (for "edit this page" links and test output). */
  dir: string;
  /** Per-track text; a track-only lesson has one entry. */
  text: Partial<Record<Track, LessonText>>;
  /** Start state (part `common/` files + `app-a`). */
  a: LessonFiles;
  /** Solution (`a` + `app-b` overrides), null when the lesson has nothing to solve. */
  b: LessonFiles | null;
}

export interface ChapterContent {
  slug: string;
  title: string;
  lessons: LessonContent[];
}

export interface PartContent {
  slug: string;
  title: string;
  chapters: ChapterContent[];
}

export interface TutorialContent {
  parts: PartContent[];
}
