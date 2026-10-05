/** Shape of `virtual:tutorial-reference` (built by build/reference.ts). */

export interface ReferenceParameter {
  /** As written in markup (`ChildContent`). */
  name: string;
  type: string;
  /** No `?`, no initializer, not cascading: the component expects it. */
  required: boolean;
  /** The initializer as written (`"primary"`, `false`). */
  default?: string;
  /** Cascading parameter: the cascade name or type it receives. */
  cascading?: string;
  /** Declared by a base class (`InputBase`). */
  inheritedFrom?: string;
  /** Rendered doc comment (HTML). */
  doc: string;
}

export interface ReferenceComponent {
  name: string;
  packageSlug: string;
  /** Rendered doc comment (HTML). */
  doc: string;
  /** The doc's first sentence (inline HTML). */
  summary: string;
  /** Abstract: a base class to extend, not a tag. */
  baseClass?: boolean;
  /** Direct base class other than ComponentBase. */
  extends?: string;
  typeParameters: string[];
  parameters: ReferenceParameter[];
  /** Lessons whose keywords name it. */
  learnIn?: LessonLink[];
}

export interface ReferencePackage {
  slug: string;
  name: string;
  description: string;
  components: ReferenceComponent[];
}

export interface ReferenceHeading {
  id: string;
  /** Inline HTML of the heading. */
  html: string;
  level: number;
}

export interface ReferenceDiagnostic {
  /** `TZS025`. */
  code: string;
  /** Anchor on the diagnostics page (`tzs025`). */
  id: string;
  severity: "error" | "warning" | "error or warning";
  /** The diagnostic's message (inline HTML). */
  title: string;
  /** When it is reported (HTML). */
  description: string;
  /** A source that reports it (highlighted HTML). */
  example?: string;
  /** How to fix it (HTML). */
  fix: string;
  /** The editor offers a quick fix. */
  quickFix?: boolean;
}

export type ApiKind = "class" | "interface" | "type" | "function" | "const" | "enum" | "namespace";

export interface ApiMember {
  name: string;
  kind: "constructor" | "method" | "property" | "accessor" | "index" | "call";
  /** Every signature (overloads, get/set), highlighted HTML. */
  signature: string;
  /** Rendered JSDoc (HTML). */
  doc: string;
  static?: boolean;
  protected?: boolean;
  /** Rendered `@deprecated` text (HTML). */
  deprecated?: string;
}

export interface ApiSymbol {
  name: string;
  kind: ApiKind;
  packageSlug: string;
  /** Declaration (class/interface: the header), highlighted HTML. */
  signature: string;
  /** Rendered JSDoc with its tags (HTML). */
  doc: string;
  /** The doc's first sentence (inline HTML). */
  summary: string;
  members: ApiMember[];
  /** Lessons whose keywords name it. */
  learnIn?: LessonLink[];
  /** A component class: its component page (base-relative). */
  component?: string;
  /** Rendered `@deprecated` text (HTML). */
  deprecated?: string;
}

export interface ApiPackage {
  slug: string;
  name: string;
  description: string;
  symbols: ApiSymbol[];
}

/** A reference entry as a link target (build/reference-links.ts). */
export interface ReferenceLink {
  /** `NavLink`, `TZS025`, a language heading's text. */
  name: string;
  /** Base-relative (`reference/components/runtime/NavLink`). */
  href: string;
  kind: "component" | "api" | "diagnostic" | "language";
  /** Package and kind, the diagnostic's message, or "Language reference". */
  detail: string;
}

/** A lesson that teaches a reference entry ("Learn it in"). */
export interface LessonLink {
  slug: string;
  /** Its title per track (a track-only lesson has one). */
  title: Partial<Record<import("./content-types").Track, string>>;
  chapter: string;
}

export interface ReferenceContent {
  packages: ReferencePackage[];
  api: ApiPackage[];
  /** Index keyword ⇒ its reference entry (filled by linkReference). */
  keywordLinks: Record<string, ReferenceLink>;
  /** Every reference entry, for the index's search (filled by linkReference). */
  search: ReferenceLink[];
  language: { html: string; headings: ReferenceHeading[] };
  diagnostics: ReferenceDiagnostic[];
}
