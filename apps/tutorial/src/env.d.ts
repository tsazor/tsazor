declare module "virtual:tutorial-content" {
  const content: import("./content-types").TutorialContent;
  export default content;
}

declare module "virtual:tutorial-bundles" {
  /** @tsazor/runtime as one ES module. */
  export const runtime: string;
  /** @tsazor/components as one ES module (imports @tsazor/runtime). */
  export const components: string;
}
