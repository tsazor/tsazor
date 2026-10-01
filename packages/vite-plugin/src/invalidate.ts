/**
 * 4.1 — HMR-Invalidierung.
 *
 * Vites Standard-Ausbreitung stoppt an selbst akzeptierenden Modulen und kennt
 * nur echte Import-Kanten. Der Tsazor-Graph hat drei weitere Abhängigkeitsarten
 * (A3 Import-Modell + 2.1 Metadaten-Cache), die dort unsichtbar sind:
 *
 * - `_Imports.tsazor` wird nie als Modul geladen; er vererbt Direktiven in jede
 *   transformierte Datei unterhalb seines Ordners.
 * - Markup-Tags, die beim letzten Transform unaufgelöst waren (TZS005), embedden
 *   kein Import — sobald ihre Komponente erscheint, müssen die Dateien neu
 *   transformiert werden.
 * - Codegen des Verbrauchers hängt an den Parameter-Metadaten des Ziels
 *   (2.2/2.3): ändert eine Komponente (auch über Code-behind/Basis), hängen die
 *   Dateien ihrer Tags neu ab.
 *
 * `TransformRegistry` hält diese Kanten pro transformierter Datei fest;
 * `planInvalidation` rechnet eine Watch-Änderung in "neu zu transformierende
 * .tsazor-Dateien" und "Routen-Manifest kann anders aussehen" über. Der Aufrufer
 * (Plugin) verteilt das Ergebnis auf Vites Modul-Graph. Pfade werden Windows-
 * gerecht case-insensitive verglichen (normalizeFileKey).
 */
import path from "node:path";
import type { CodegenResult } from "@tsazor/compiler";

/** Absolute, POSIX-getrennte, kleingeschriebene Form eines Pfads (Windows-Regel). */
export function normalizeFileKey(file: string): string {
  return path.resolve(file).replace(/\\/g, "/").toLowerCase();
}

export function sameFile(a: string, b: string): boolean {
  return normalizeFileKey(a) === normalizeFileKey(b);
}

/** Routen-relevante Metadaten einer Seite (Routen-Manifest). */
export interface RouteSignature {
  templates: string[];
  layout?: string;
  authorize?: boolean;
  authorizeData?: { roles?: string[]; policy?: string };
}

type CodegenMetadata = CodegenResult["metadata"];

/**
 * Alles, was der Transform einer .tsazor-Datei festgehalten hat — die Kanten
 * für 4.1. `routes`/`layoutName`/`unresolvedTags` werden auch vom Hot-Update
 * (eigenes Neukompilieren) aktualisiert; `componentFiles` nur im Transform.
 */
export interface TransformRecord {
  /** Absoluter Pfad, wie er vom Transform gemeldet wurde. */
  file: string;
  /** Tags (TZS005), die beim letzten Transform unaufgelöst blieben. */
  unresolvedTags: string[];
  /** `@layout`-Name (auch in `_Imports.tsazor` — das Basis-Layout der Kette). */
  layoutName?: string;
  routes: RouteSignature;
  /** Absolute Komponenten-Dateien, auf die die Tags des Files aufgelöst sind (2.1-Metadaten). */
  componentFiles: string[];
}

function newRecord(file: string): TransformRecord {
  return { file, unresolvedTags: [], routes: { templates: [] }, componentFiles: [] };
}

export class TransformRegistry {
  private readonly records = new Map<string, TransformRecord>();

  /** Der Eintrag einer Datei (case-insensitive), oder undefined. */
  get(file: string): TransformRecord | undefined {
    return this.records.get(normalizeFileKey(file));
  }

  /** Absolute Pfade (Original-Schreibung) aller transformierten Dateien. */
  files(): string[] {
    return [...this.records.values()].map((record) => record.file);
  }

  private entryFor(file: string): TransformRecord {
    const key = normalizeFileKey(file);
    let record = this.records.get(key);
    if (!record) {
      record = newRecord(file);
      this.records.set(key, record);
    }
    return record;
  }

  /** Routes/Tags vom Hot-Update-Neukompilieren her anreichern (Kanten bleiben). */
  recordDynamic(file: string, metadata: CodegenMetadata | undefined, isImports: boolean): void {
    const record = this.entryFor(file);
    if (metadata === undefined) return;
    if (isImports) {
      record.unresolvedTags = [];
      record.layoutName = metadata.layout;
      record.routes = { templates: [] };
      return;
    }
    record.unresolvedTags = [...metadata.unresolvedTags];
    record.layoutName = metadata.layout ?? record.layoutName;
    record.routes = {
      templates: [...metadata.routeTemplates],
      ...(metadata.layout !== undefined ? { layout: metadata.layout } : {}),
      ...(metadata.authorize === true ? { authorize: true } : {}),
      ...(metadata.authorizeData !== undefined ? { authorizeData: metadata.authorizeData } : {}),
    };
  }

  /** Vom Transform her festhalten: Routen, unaufgelöste Tags, verbrauchte Komponenten-Dateien. */
  recordTransform(file: string, metadata: CodegenMetadata, componentFiles: Iterable<string>): void {
    this.recordDynamic(file, metadata, false);
    const record = this.entryFor(file);
    record.componentFiles = [...componentFiles];
  }

  remove(file: string): void {
    this.records.delete(normalizeFileKey(file));
  }

  /** Dateien, deren Tags zu `componentFile` aufgelöst sind (Verbraucherkanten). */
  consumersOf(componentFile: string): string[] {
    const target = normalizeFileKey(componentFile);
    const result: string[] = [];
    for (const record of this.records.values()) {
      if (record.componentFiles.some((file) => normalizeFileKey(file) === target)) result.push(record.file);
    }
    return result;
  }

  /** Dateien, deren Tags `tag` (case-insensitive = Windows/Blazor-Regel) unaufgelöst ließen. */
  filesWithUnresolvedTag(tag: string): string[] {
    const lowered = tag.toLowerCase();
    const result: string[] = [];
    for (const record of this.records.values()) {
      if (record.unresolvedTags.some((candidate) => candidate.toLowerCase() === lowered)) result.push(record.file);
    }
    return result;
  }

  /** Nutzt irgendein Eintrag (Seite oder `_Imports`) `@layout <className>`? */
  hasLayoutNameOf(className: string): boolean {
    const lowered = className.toLowerCase();
    return [...this.records.values()].some((record) => (record.layoutName ?? "").toLowerCase() === lowered);
  }
}

/* Invalidierungsplan ---------------------------------------------------------- */

export interface InvalidationPlan {
  /** .tsazor-Dateien, deren erzeugtes Modul sich ändern kann — neu transformieren. */
  retransform: string[];
  /** Das `virtual:tsazor-routes`-Manifest kann anders aussehen (Vite: Reload). */
  routesModule: boolean;
  /** Die Datei ist eine `.tsazor.css`-Sidecar, die verschwand — Vite kann den
   *  injizierten Style nicht zurücknehmen; voller Reload statt HMR. */
  fullReload: boolean;
}

export interface WatchEventContext {
  /** Absoluter Pfad der geänderten Datei, wie der Beobachter sie meldet. */
  file: string;
  event: "update" | "create" | "delete";
  /** Frisch kompilierte Metadaten der Datei (Hot-Update liest+compiliert). Undefined: löschen/leseschwierig. */
  metadata: CodegenMetadata | undefined;
  /** Registry des Plugins (Transform-Aufzeichnungen). */
  registry: TransformRegistry;
  /** Alle .tsazor-Dateien unter `dir` (Routen-Scan-Regeln), absolut. */
  listTsazorUnder: (dir: string) => Promise<string[]>;
  /** Metadaten-Rückwärtskanten (2.1-Cache): Komponenten-Dateien, deren Kette `file` liest. */
  dependentsOf: (file: string) => string[];
}

export function isImportsFile(file: string): boolean {
  return path.basename(file).toLowerCase() === "_imports.tsazor";
}

/**
 * Wandelt eine Dateiänderung in den Invalidierungsplan. Semantik laut 4.1:
 * Sidecar hinzufügen/entfernen ⇒ Besitzer; `_Imports.tsazor` ⇒ alle Dateien
 * darunter; neu hinzugefügte Komponente ⇒ Dateien mit vorher unaufgelöstem
 * Tag; jede Komponenten-Änderung ⇒ ihre Tag-Verbraucher (Metadaten-Codegen);
 * `@page`/Layout neu oder weg ⇒ Routen-Manifest. Basis-Ketten hängen über
 * `dependentsOf` (2.1-Cache) mit.
 */
export async function planInvalidation(context: WatchEventContext): Promise<InvalidationPlan> {
  const { file, event, metadata, registry, listTsazorUnder, dependentsOf } = context;
  const added = new Set<string>([normalizeFileKey(file)]);
  const mark = (candidates: Iterable<string>): string[] => {
    const result: string[] = [];
    for (const candidate of candidates) {
      const key = normalizeFileKey(candidate);
      if (added.has(key)) continue;
      added.add(key);
      result.push(candidate);
    }
    return result;
  };
  const dependents = mark(dependentsOf(file));

  const plan: InvalidationPlan = { retransform: [], routesModule: false, fullReload: false };

  // Code-behind-Sidecar: das Besitzer-.tsazor ändert seine Klasse (auch seine
  // Tag-Verbraucher — das geflattene Parameter-Bild der Komponente ändert sich).
  if (/\.tsazor\.ts$/i.test(file)) {
    const owner = file.slice(0, -".ts".length);
    registry.remove(file);
    plan.retransform = mark([owner, ...dependents, ...registry.consumersOf(owner)]);
    return plan;
  }

  // Scoped-CSS-Sidecar: Inhalt ändern macht Vite selbst; hinzufügen/entfernen
  // ändert das erzeugte Modul (Import + Scope-Attribut).
  if (/\.tsazor\.css$/i.test(file)) {
    const owner = file.slice(0, -".css".length);
    if (event === "update") return plan;
    if (event === "delete") plan.fullReload = true;
    plan.retransform = mark([owner]);
    return plan;
  }

  if (isImportsFile(file)) {
    const previous = registry.get(file);
    const layoutChanged = previous !== undefined && previous.layoutName !== (metadata?.layout ?? undefined);
    registry.recordDynamic(file, metadata, true);
    plan.retransform = mark([...dependents, ...(await listTsazorUnder(path.dirname(file)))]);
    plan.routesModule = metadata !== undefined && layoutChanged;
    return plan;
  }

  if (!file.toLowerCase().endsWith(".tsazor")) {
    // Beliebiges .ts: der Metadaten-Cache kennt die Basisketten — Dateien, die
    // eine Klasse daraus erben, neu transformieren (Vite deckt direkte Imports ab).
    plan.retransform = dependents;
    return plan;
  }

  const className = path.basename(file).replace(/\.[^.]+$/, "");
  const previous = registry.get(file);

  if (event === "update") {
    registry.recordDynamic(file, metadata, false);
    plan.retransform = mark([...dependents, ...registry.consumersOf(file)]);
    plan.routesModule = metadata !== undefined && routesSignatureChanged(previous?.routes, metadata);
    return plan;
  }

  if (event === "create") {
    registry.recordDynamic(file, metadata, false);
    const consumers = new Set(registry.filesWithUnresolvedTag(className));
    for (const consumer of registry.consumersOf(file)) consumers.add(consumer);
    plan.retransform = mark([...dependents, ...consumers]);
    // Neue Seite, neues Layout — beides ändert das Routen-Manifest.
    plan.routesModule =
      (metadata !== undefined && routesSignatureChanged(undefined, metadata)) ||
      (metadata !== undefined && layoutNameMatches(registry, className));
    return plan;
  }

  // delete
  const hadRoutes = previous !== undefined && previous.routes.templates.length > 0;
  const hadLayoutUse = layoutNameMatches(registry, className);
  registry.remove(file);
  plan.retransform = mark([...dependents, ...registry.consumersOf(file)]);
  plan.routesModule = hadRoutes || hadLayoutUse;
  return plan;
}

function routesSignatureChanged(previous: RouteSignature | undefined, metadata: CodegenMetadata): boolean {
  const after: RouteSignature = {
    templates: metadata.routeTemplates,
    ...(metadata.layout !== undefined ? { layout: metadata.layout } : {}),
    ...(metadata.authorize === true ? { authorize: true } : {}),
    ...(metadata.authorizeData !== undefined ? { authorizeData: metadata.authorizeData } : {}),
  };
  return signatureOf(previous) !== signatureOf(after);
}

function signatureOf(routes: RouteSignature | undefined): string {
  return JSON.stringify({
    templates: [...(routes?.templates ?? [])].sort(),
    layout: routes?.layout,
    authorize: routes?.authorize === true,
    authorizeData: routes?.authorizeData !== undefined ? { ...routes.authorizeData } : undefined,
  });
}

/** Dateien (oder _Imports) mit einer `@layout <className>`-Anweisung. */
function layoutNameMatches(registry: TransformRegistry, className: string): boolean {
  return registry.hasLayoutNameOf(className);
}