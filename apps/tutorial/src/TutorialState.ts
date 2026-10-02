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

  find(track: Track, slug: string): LessonRef | undefined {
    return this.lessons(track).find((ref) => ref.lesson.slug === slug);
  }

  /** The files the editor shows for a lesson: the saved workspace, else the start state. */
  workspace(lesson: LessonContent): LessonFiles {
    return this.workspaces.get(lesson.slug) ?? { ...lesson.a };
  }

  saveWorkspace(lesson: LessonContent, files: LessonFiles): void {
    this.workspaces.set(lesson.slug, files);
  }
}
