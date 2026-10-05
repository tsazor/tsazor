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

export interface ReferenceContent {
  packages: ReferencePackage[];
  language: { html: string; headings: ReferenceHeading[] };
}
