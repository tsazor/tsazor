/**
 * StringLocalizer — Blazor's IStringLocalizer counterpart (E8,
 * design-localization.md §2). One service, one flat key space; Blazor's
 * IStringLocalizer<T> marks a resource class `T`, but TS tables are plain
 * modules, so `T` has no counterpart — the key space is the app's convention
 * (recommended: dot-namespaced keys, "Orders.Title").
 *
 * Access is `L.get(key, params)` (decision D-L2), not Blazor's `L["key"]`:
 * a class index signature cannot carry methods in TS, so the indexer would
 * need a Proxy plus typing workarounds — bent TS for a C# shape. `get` also
 * carries the placeholders in one call, where .NET needs string.Format after.
 *
 * Fallback policy (never throw — the port's app threw on a missing key, which
 * port-findings R.1 calls wrong): current culture's table → default culture's
 * table → the key itself; a missing key warns in dev mode. A locale without a
 * table is not an error either — it serves the default culture until its
 * (async) table arrives, and the arrival re-renders every culture-aware
 * component (auto-render, D-L6).
 *
 * Placeholders are .NET 8's named composite format (decision D-L5): "Willkommen,
 * {name}!" with `{{`/`}}` as literal braces. Typed placeholders come free from
 * the default table's literal type (decision D-L4): `PlaceholdersOf` extracts
 * them at the type level, so missing or misspelled params are TS errors.
 */
import { DEV } from "../components/observe.js";
import { markAutoRender } from "../di/service-provider.js";
import { CultureService } from "./culture-service.js";

/** A flat key → message table. */
export type StringTable = Record<string, string>;

/**
 * A table source: the table itself, or an async loader. `import()` works —
 * the module's `default` export is the table (`export default { … }`).
 */
export type StringTableSource = StringTable | (() => Promise<StringTable | { default: StringTable }>);

/**
 * The named placeholders a message requires, extracted from its literal type:
 * `PlaceholdersOf<"Willkommen, {name}!">` = `{ name: string | number }`. A
 * message without placeholders yields `unknown` (params optional, unchecked);
 * `{{…}}` literals are skipped.
 */
export type PlaceholdersOf<Message extends string> =
  Message extends `${string}{{${infer Rest}`
    ? PlaceholdersOf<Rest>
    : Message extends `${string}{${infer Name}}${infer Rest}`
      ? Name extends ""
        ? never
        : { [K in Name]: string | number } & PlaceholdersOf<Rest>
      : unknown;

export interface StringLocalizerOptions {
  /**
   * Culture → table (a record, or an async loader). The default culture's
   * table is the fallback for missing keys and missing locales.
   */
  readonly tables?: Readonly<Record<string, StringTableSource>>;
  /** The default culture — required when `tables` has entries. */
  readonly defaultCulture?: string;
  /**
   * The culture service (the app-wide state). Without one a private service
   * is used — switching *that* state re-localizes nothing the app can reach;
   * `createTsazorApp({ localization })` and the documented registration recipe
   * pass the shared one.
   */
  readonly culture?: CultureService;
}

export class StringLocalizer<Table extends StringTable = StringTable> {
  private readonly tables: Readonly<Record<string, StringTableSource>>;
  private readonly defaultCulture: string;
  private readonly cultureService: CultureService;
  /** Loaded tables (culture name → table); a loader's promise dedups per culture. */
  private readonly loaded = new Map<string, StringTable>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly handlers = new Set<() => void>();
  private readonly cultureSubscription: () => void;

  /** `new StringLocalizer()` is a valid empty localizer: `get` returns the key. */
  constructor(options: StringLocalizerOptions = {}) {
    this.tables = options.tables ?? {};
    this.defaultCulture = options.defaultCulture ?? "";
    if (Object.keys(this.tables).length > 0 && this.defaultCulture === "") {
      throw new Error("StringLocalizer: tables require a defaultCulture (its table is the fallback for missing keys and locales).");
    }
    this.cultureService = options.culture ?? new CultureService();
    markAutoRender(this);
    // A culture change re-localizes every consumer (the auto-render source).
    this.cultureSubscription = this.cultureService.subscribe(() => this.notify());
  }

  /** The culture the localizer translates for (the CultureService's current). */
  get culture(): string {
    return this.cultureService.current.name;
  }

  /**
   * The translation: `L.get("Welcome", { name: "Ann" })`. Keys are typed by
   * the default table's literal type when the registration parameterizes the
   * localizer; the placeholders are typed per message (`PlaceholdersOf`).
   * Missing key → the key itself (dev warning), never a throw.
   */
  get<K extends keyof Table & string>(key: K, params?: PlaceholdersOf<Table[K]>): string {
    const message = this.resolve(key);
    if (message === undefined) {
      if (DEV) console.warn(`[tsazor] StringLocalizer: no message for key '${key}' (culture '${this.culture}' and default '${this.defaultCulture}' checked).`);
      return key;
    }
    return formatMessage(message, params as Record<string, unknown> | undefined);
  }

  /**
   * Blazor's GetAllStrings: the loaded table of a culture (default: the
   * current one). An async table that has not arrived yields the fallback
   * culture's loaded entries.
   */
  all(culture?: string): readonly { key: string; value: string }[] {
    const table = this.tableOf(culture ?? this.culture) ?? this.tableOf(this.defaultCulture);
    return Object.entries(table ?? {}).map(([key, value]) => ({ key, value }));
  }

  /**
   * Re-localization notifications — the source the auto-render observes
   * (culture change, async table arrival).
   */
  subscribe(listener: () => void): () => void {
    this.handlers.add(listener);
    return () => {
      this.handlers.delete(listener);
    };
  }

  /** Ends the culture subscription and drops every listener (a localizer a provider created gets disposed with it). */
  dispose(): void {
    this.cultureSubscription();
    this.handlers.clear();
  }

  /**
   * @internal The raw message of a key without placeholder formatting —
   * `undefined` when missing (the validation message resolver's fallback
   * check; reserved `tsazor.validation.*` keys).
   */
  raw(key: string): string | undefined {
    return this.resolve(key);
  }

  /** The fallback chain: current culture's table → default culture's table. */
  private resolve(key: string): string | undefined {
    const culture = this.culture;
    if (culture !== "") {
      const value = this.tableOf(culture)?.[key];
      if (value !== undefined) return value;
    }
    return this.tableOf(this.defaultCulture)?.[key];
  }

  /** A culture's loaded table — undefined while its loader is in flight (or there is none). */
  private tableOf(culture: string): StringTable | undefined {
    const source = this.tables[culture];
    if (source === undefined) return undefined;
    if (typeof source !== "function") return source;
    const cached = this.loaded.get(culture);
    if (cached !== undefined) return cached;
    this.ensureLoaded(culture, source);
    return undefined;
  }

  /** Kicks off (once per culture) and stores a loader's result; the arrival notifies. */
  private ensureLoaded(culture: string, loader: () => Promise<StringTable | { default: StringTable }>): void {
    if (this.loading.has(culture)) return;
    const pending = loader()
      .then((module) => {
        const table = module as StringTable | { default: StringTable };
        const resolved = typeof (table as { default?: StringTable }).default === "object"
          ? (table as { default: StringTable }).default
          : (table as StringTable);
        this.loaded.set(culture, resolved);
      })
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console
        if (DEV) console.warn(`[tsazor] StringLocalizer: the table for '${culture}' failed to load.`, error);
      })
      .finally(() => {
        this.loading.delete(culture);
      });
    this.loading.set(culture, pending);
    // The arrival re-renders culture-aware components even when the load
    // completed synchronously — notify() defers to the handlers regardless.
    void pending.then(() => this.notify());
  }

  private notify(): void {
    for (const handler of [...this.handlers]) {
      handler();
    }
  }
}

/**
 * Formats a message's named placeholders: "{name}" → params.name; `{{` and
 * `}}` are literal braces (.NET's CompositeFormat escaping). A missing param
 * renders the placeholder text unchanged (dev warning) — lenient like .NET's
 * string.Format on named placeholders, never a throw.
 */
export function formatMessage(template: string, params?: Record<string, unknown>): string {
  const unescape = (braces: string): string => (braces === "{{" ? "{" : "}");
  if (params === undefined) return template.replace(/\{\{|\}\}/g, unescape);
  let result = "";
  let i = 0;
  while (i < template.length) {
    if (template.startsWith("{{", i)) {
      result += "{";
      i += 2;
      continue;
    }
    if (template.startsWith("}}", i)) {
      result += "}";
      i += 2;
      continue;
    }
    const open = template.indexOf("{", i);
    if (open === -1) {
      result += template.slice(i);
      break;
    }
    result += template.slice(i, open);
    const close = template.indexOf("}", open);
    if (close === -1) {
      result += template.slice(open);
      break;
    }
    const name = template.slice(open + 1, close);
    const value = Object.hasOwn(params, name) ? params[name] : undefined;
    if (value !== undefined) {
      result += String(value);
    } else {
      result += template.slice(open, close + 1);
      // eslint-disable-next-line no-console
      if (DEV) console.warn(`[tsazor] StringLocalizer: no value for placeholder '{${name}}'.`);
    }
    i = close + 1;
  }
  return result;
}