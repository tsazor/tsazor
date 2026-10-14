/**
 * Library build for @tsazor/markdown through `buildLibrary` (@tsazor/cli), as the skins build: the components, the
 * helpers with their declarations, the manifest and the declarations, and markdown.css (src/styles).
 */
import { buildLibrary } from "@tsazor/cli";

const result = await buildLibrary({
  exports: ['export { renderMarkdown } from "./render-markdown.js"'],
  typeExports: ['export type { MarkdownOptions } from "./render-markdown.js"'],
  stylesheet: { file: "markdown.css" },
});
if (result.errors.length > 0) process.exit(1);
