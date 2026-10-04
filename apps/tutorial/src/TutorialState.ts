/**
 * App-wide tutorial state (registered as a singleton in Program.ts):
 * the content index, the persisted track and the in-memory workspaces —
 * edits survive navigating between lessons until the page reloads.
 */
import content from "virtual:tutorial-content";
import type { ChapterContent, LessonContent, LessonFiles, PartContent, Track } from "./content-types";

export const TRACK_LABELS: Record<Track, string> = {
  blazor: "Blazor developer",
  ts: "TypeScript developer",
};

const STORAGE_KEY = "tsazor-tutorial:track";

export interface LessonRef {
  lesson: LessonContent;
  chapter: ChapterContent;
  part: PartContent;
  /** Position in the track's lesson order. */
  index: number;
}

export function isTrack(value: string): value is Track {
  return value === "blazor" || value === "ts";
}

export class TutorialState {
  readonly content = content;
  private readonly workspaces = new Map<string, LessonFiles>();

  /** The track last visited (localStorage), default "ts". */
  get preferredTrack(): Track {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isTrack(stored)) return stored;
    } catch {
      // storage blocked (private mode, sandbox): fall back to the default
    }
    return "ts";
  }

  set preferredTrack(track: Track) {
    try {
      localStorage.setItem(STORAGE_KEY, track);
    } catch {
      // not persisted — the URL still carries the track
    }
  }

  /** The lessons of a track, in order. */
  lessons(track: Track): LessonRef[] {
    const refs: LessonRef[] = [];
    for (const part of this.content.parts) {
      for (const chapter of part.chapters) {
        for (const lesson of chapter.lessons) {
          if (lesson.text[track]) refs.push({ lesson, chapter, part, index: refs.length });
        }
      }
    }
    return refs;
  }

  /** The lesson last opened in a track (localStorage), for the start page's "Continue". */
  lastLesson(track: Track): LessonRef | undefined {
    try {
      const slug = localStorage.getItem(`${STORAGE_KEY}:${track}:last`);
      return slug ? this.find(track, slug) : undefined;
    } catch {
      return undefined;
    }
  }

  rememberLesson(track: Track, slug: string): void {
    try {
      localStorage.setItem(`${STORAGE_KEY}:${track}:last`, slug);
    } catch {
      // not persisted — the start page then offers the first lesson
    }
  }

  /** The first lesson of a chapter in a track (a chapter can be track-only). */
  chapterStart(track: Track, chapter: ChapterContent): LessonRef | undefined {
    return this.lessons(track).find((ref) => ref.chapter === chapter);
  }

  find(track: Track, slug: string): LessonRef | undefined {
    return this.lessons(track).find((ref) => ref.lesson.slug === slug);
  }

  /**
   * Where the track switch leads from `lesson`: the same lesson in `track`,
   * else (a track-only lesson) the next lesson `track` has, else its last one.
   */
  counterpart(track: Track, lesson: LessonContent): LessonRef | undefined {
    const refs = this.lessons(track);
    const all = this.content.parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.lessons));
    const next = all.slice(Math.max(0, all.indexOf(lesson))).find((candidate) => candidate.text[track]);
    return refs.find((ref) => ref.lesson === next) ?? refs.at(-1);
  }

  /** The files the editor shows for a lesson: the saved workspace, else the start state. */
  workspace(lesson: LessonContent): LessonFiles {
    return this.workspaces.get(lesson.slug) ?? { ...lesson.a };
  }

  saveWorkspace(lesson: LessonContent, files: LessonFiles): void {
    this.workspaces.set(lesson.slug, files);
  }
}
