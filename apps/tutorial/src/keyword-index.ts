/**
 * The keyword index (`/index`): the lessons' front-matter `keywords`,
 * grouped by initial letter. `@bind`, `::deep` and `.tsazor.css` sort by
 * their first letter (b, d, t); entries without one (`?.`, `===`) go first
 * under "Symbols".
 */
import type { Track } from "./content-types";
import type { ReferenceLink } from "./reference-types";
import type { LessonRef } from "./TutorialState";

export interface IndexEntry {
  keyword: string;
  /** The lessons listing the keyword, in track order. */
  refs: LessonRef[];
}

export interface IndexGroup {
  /** "a"…"z" or "symbols" (element ids). */
  id: string;
  heading: string;
  entries: IndexEntry[];
}

/**
 * Code (`@bind:after`, `NavLink`, `vi.fn`, `??`: has `@ . : # (`, an
 * upper-case letter or no letter at all) rather than a plain term
 * ("two-way binding").
 */
export function isCodeLike(keyword: string): boolean {
  return /[@.:#(]/.test(keyword) || !/[a-z]/i.test(keyword) || (/^[A-Za-z_$][\w$]*$/.test(keyword) && keyword !== keyword.toLowerCase());
}

/** The keyword without leading punctuation, lower-cased: `@bind:after` → `bind:after`. */
export function sortKeyOf(keyword: string): string {
  return keyword.replace(/^[^A-Za-z]+/, "").toLowerCase();
}

export function buildIndex(refs: LessonRef[], track: Track, query = ""): IndexGroup[] {
  const byKeyword = new Map<string, LessonRef[]>();
  for (const ref of refs) {
    for (const keyword of ref.lesson.text[track]?.keywords ?? []) {
      const list = byKeyword.get(keyword) ?? [];
      list.push(ref);
      byKeyword.set(keyword, list);
    }
  }

  const needle = query.trim().toLowerCase();
  const entries = [...byKeyword]
    .filter(([keyword]) => needle === "" || keyword.toLowerCase().includes(needle))
    .map(([keyword, list]) => ({ keyword, sortKey: sortKeyOf(keyword), refs: list }))
    .sort((a, b) => compare(a.sortKey, b.sortKey) || compare(a.keyword, b.keyword));

  const groups: IndexGroup[] = [];
  for (const { keyword, sortKey, refs: list } of entries) {
    const id = sortKey === "" ? "symbols" : sortKey.charAt(0);
    let group = groups.at(-1);
    if (group?.id !== id) {
      group = { id, heading: id === "symbols" ? "Symbols" : id.toUpperCase(), entries: [] };
      groups.push(group);
    }
    group.entries.push({ keyword, refs: list });
  }
  return groups;
}

const compare = (a: string, b: string): number => a.localeCompare(b, "en");

/**
 * The reference entries for a search: exact name first, then names that
 * start with the query, then names that contain it; at most `limit`.
 * Nothing for an empty query.
 */
export function searchReference(entries: readonly ReferenceLink[], query: string, limit = 12): ReferenceLink[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  const rank = (entry: ReferenceLink): number => {
    const name = entry.name.toLowerCase();
    return name === needle ? 0 : name.startsWith(needle) || sortKeyOf(entry.name).startsWith(sortKeyOf(needle)) ? 1 : name.includes(needle) ? 2 : 3;
  };
  return entries
    .map((entry) => ({ entry, rank: rank(entry) }))
    .filter(({ rank }) => rank < 3)
    .sort((a, b) => a.rank - b.rank || a.entry.name.length - b.entry.name.length || compare(a.entry.name, b.entry.name))
    .slice(0, limit)
    .map(({ entry }) => entry);
}
