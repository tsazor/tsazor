/**
 * The Icons page's data: this skin's icon set as groups, each loaded when the page shows it (its own chunk in a
 * build), with the Razor form a page writes. Fluent's set has a group per variant and size
 * (`Icons.Regular.Size20.Save`, the module `@tsazor/fluent-icons/regular/size20`); Bootstrap's has one (`Icons.Save`).
 *
 * A module a page also imports statically (skin-icons.ts) stays whole in the main chunk: Rollup can't drop the
 * exports a dynamic import may reach. That is this demo's cost of having both; an app without a browser keeps only
 * the icons it uses.
 */
import type { IconValue } from "@tsazor/ui";
import { skin } from "./skin";

export interface IconEntry {
  /** The export's name ("Save"). */
  readonly name: string;
  /** What a page writes: `Icons.Regular.Size20.Save`. */
  readonly path: string;
  readonly value: IconValue;
  /** Lowercase name and kebab name, for the search. */
  readonly keywords: string;
}

/** A module of icons (its type also has the synthetic `default` of a dynamic import). */
type Module = object;

export interface IconGroup {
  /** "Regular", or "" for a set without variants. */
  readonly variant: string;
  /** "Size20", or "". */
  readonly size: string;
  readonly load: () => Promise<Module>;
}

const fluent = (variant: string, size: number, load: () => Promise<Module>): IconGroup => ({ variant, size: `Size${size}`, load });

/** The modules of @tsazor/fluent-icons, as its dist has them. */
const FLUENT: readonly IconGroup[] = [
  fluent("Regular", 10, () => import("@tsazor/fluent-icons/regular/size10")),
  fluent("Regular", 12, () => import("@tsazor/fluent-icons/regular/size12")),
  fluent("Regular", 16, () => import("@tsazor/fluent-icons/regular/size16")),
  fluent("Regular", 20, () => import("@tsazor/fluent-icons/regular/size20")),
  fluent("Regular", 24, () => import("@tsazor/fluent-icons/regular/size24")),
  fluent("Regular", 28, () => import("@tsazor/fluent-icons/regular/size28")),
  fluent("Regular", 32, () => import("@tsazor/fluent-icons/regular/size32")),
  fluent("Regular", 48, () => import("@tsazor/fluent-icons/regular/size48")),
  fluent("Filled", 10, () => import("@tsazor/fluent-icons/filled/size10")),
  fluent("Filled", 12, () => import("@tsazor/fluent-icons/filled/size12")),
  fluent("Filled", 16, () => import("@tsazor/fluent-icons/filled/size16")),
  fluent("Filled", 20, () => import("@tsazor/fluent-icons/filled/size20")),
  fluent("Filled", 24, () => import("@tsazor/fluent-icons/filled/size24")),
  fluent("Filled", 28, () => import("@tsazor/fluent-icons/filled/size28")),
  fluent("Filled", 32, () => import("@tsazor/fluent-icons/filled/size32")),
  fluent("Filled", 48, () => import("@tsazor/fluent-icons/filled/size48")),
  fluent("Light", 24, () => import("@tsazor/fluent-icons/light/size24")),
  fluent("Light", 28, () => import("@tsazor/fluent-icons/light/size28")),
  fluent("Light", 32, () => import("@tsazor/fluent-icons/light/size32")),
  fluent("Light", 48, () => import("@tsazor/fluent-icons/light/size48")),
  fluent("Color", 16, () => import("@tsazor/fluent-icons/color/size16")),
  fluent("Color", 20, () => import("@tsazor/fluent-icons/color/size20")),
  fluent("Color", 24, () => import("@tsazor/fluent-icons/color/size24")),
  fluent("Color", 28, () => import("@tsazor/fluent-icons/color/size28")),
  fluent("Color", 32, () => import("@tsazor/fluent-icons/color/size32")),
  fluent("Color", 48, () => import("@tsazor/fluent-icons/color/size48")),
];

const BOOTSTRAP: readonly IconGroup[] = [{ variant: "", size: "", load: () => import("@tsazor/bootstrap-icons") }];

/** This skin's groups, Fluent's Regular Size20 first. */
export const iconGroups: readonly IconGroup[] = skin === "fluent" ? FLUENT : BOOTSTRAP;

/** The package a page imports. */
export const iconPackage = skin === "fluent" ? "@tsazor/fluent-icons" : "@tsazor/bootstrap-icons";

const loaded = new Map<IconGroup, readonly IconEntry[]>();

/** A group's icons (loaded once). */
export async function iconsOf(group: IconGroup): Promise<readonly IconEntry[]> {
  const known = loaded.get(group);
  if (known !== undefined) return known;
  const prefix = group.variant === "" ? "Icons" : `Icons.${group.variant}.${group.size}`;
  const icons = Object.entries(await group.load() as Record<string, IconValue>).filter(([name]) => name !== "default");
  const entries = icons.map(([name, value]) => ({
    name,
    path: `${prefix}.${name}`,
    value,
    keywords: `${name.toLowerCase()} ${value.name}`,
  }));
  loaded.set(group, entries);
  return entries;
}

/** The entries whose name has every word of the query. */
export function searchIcons(entries: readonly IconEntry[], query: string): readonly IconEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return entries;
  return entries.filter((entry) => words.every((word) => entry.keywords.includes(word)));
}

/** Rows of `columns` entries, for Virtualize. */
export function rowsOf(entries: readonly IconEntry[], columns: number): IconEntry[][] {
  const rows: IconEntry[][] = [];
  for (let i = 0; i < entries.length; i += columns) rows.push(entries.slice(i, i + columns));
  return rows;
}
