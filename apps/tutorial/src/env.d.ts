declare module "virtual:tutorial-content" {
  const content: import("./content-types").TutorialContent;
  export default content;
}

declare module "virtual:tutorial-reference" {
  const reference: import("./reference-types").ReferenceContent;
  export default reference;
}

declare module "virtual:tutorial-types" {
  /** Absolute path → content: lib .d.ts files and the @tsazor package declarations. */
  const types: Readonly<Record<string, string>>;
  export default types;
}

declare module "virtual:tutorial-bundles" {
  /** @tsazor/runtime as one ES module. */
  export const runtime: string;
  /** @tsazor/bootstrap as one ES module (imports @tsazor/runtime). */
  export const components: string;
  /** @tsazor/dotnet as one ES module (imports @tsazor/runtime). */
  export const dotnet: string;
  /** @tsazor/testing as one ES module (imports @tsazor/runtime). */
  export const testing: string;
  /** The preview's test runner, served as "vitest". */
  export const vitest: string;
  /** @tsazor/runtime/transition, /animate and /easing as ES modules. */
  export const transition: string;
  export const animate: string;
  export const easing: string;
}
