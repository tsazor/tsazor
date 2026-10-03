declare module "virtual:tutorial-content" {
  const content: import("./content-types").TutorialContent;
  export default content;
}

declare module "virtual:tutorial-types" {
  /** Absolute path → content: lib .d.ts files and the @tsazor package declarations. */
  const types: Readonly<Record<string, string>>;
  export default types;
}

declare module "virtual:tutorial-bundles" {
  /** @tsazor/runtime as one ES module. */
  export const runtime: string;
  /** @tsazor/components as one ES module (imports @tsazor/runtime). */
  export const components: string;
  /** @tsazor/dotnet as one ES module (imports @tsazor/runtime). */
  export const dotnet: string;
}
