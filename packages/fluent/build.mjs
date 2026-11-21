/**
 * Library build for @tsazor/fluent through `buildLibrary` (@tsazor/cli): the components, the helpers, the manifest and
 * the declarations, and fluent.css — the design tokens (src/styles) first, then the components' sidecar CSS.
 */
import path from "node:path";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildLibrary } from "@tsazor/cli";

const result = await buildLibrary({
  // Compiled for the components that use them, not exported (DataGrid's Defer).
  internal: ["Defer", "TreeViewNode", "ChipContent", "WizardStepHeader", "WizardFormLink"],
  // Extra export names (the shared vocabulary): Bootstrap's names for the menu button and the form.
  aliases: { Dropdown: "Menu", DropdownItem: "MenuItem", Form: "FluentForm", MultiSplitter: "Splitter", MultiSplitterPane: "SplitterPane" },
  exports: [
    // The toast service comes with the skin: register it, inject it, call show() (as in @tsazor/bootstrap).
    'export { Toaster } from "@tsazor/ui"',
    // Dialogs opened from code: the service and the reference a dialog closes (MudBlazor's IDialogService).
    'export { DialogReference, DialogService } from "@tsazor/ui"',
    // An app's own icons (`icon(name, svg)`), so it needs no other package for them.
    'export { icon } from "@tsazor/ui"',
    // The DataGrid's sorting and paging state come with the skin too.
    'export { GridSort, PaginationState } from "@tsazor/ui"',
    // FileUpload's uploader (`uploadTo(url)`) and file sizes.
    'export { formatFileSize, uploadFile, uploadTo } from "@tsazor/ui"',
    // Plain helpers the package exports besides its components.
    'export { tooltip } from "./tooltip-attachment.js"',
    // What an Autocomplete's onOptionsSearch handler gets.
    'export { OptionsSearchEventArgs } from "@tsazor/ui"',
    // The services the components use, in one call (package.json `tsazor.setup` names it).
    'export { addFluent } from "./services.js"',
  ],
  // The types the components' parameters name come with the skin: `@import type { Intent } from "@tsazor/fluent"`.
  reexportTypes: ["@tsazor/ui"],
  typeExports: [
    // And the types of the services and the grid model it re-exports.
    'export type { DialogOptions, DialogParameters, DialogResult, GridItemsProviderRequest, GridItemsProviderResult, HexColor, SortDirection, SortedProperty, ToastAction, ToastEntry, ToastOptions } from "@tsazor/ui"',
    // The public design tokens (FluentProvider's tokenOverrides).
    'export type { FluentBrandStep, FluentToken, FluentTokenOverrides } from "./tokens.js"',
  ],
  // The exported helpers' declarations, with their docs; src/tokens.ts holds types only, its groups commented.
  declarations: {
    "tokens.d.ts": readFileSync(new URL("./src/tokens.ts", import.meta.url), "utf8"),
    "tooltip-attachment.d.ts":
      'import type { Attachment } from "@tsazor/runtime";\nimport type { Placement } from "@tsazor/ui";\n/** A Fluent tooltip on any element: `<button @attach="tooltip(\'Save\')">`; the same text gives the same attachment. */\nexport declare function tooltip(text: string, placement?: Placement): Attachment<HTMLElement>;\n',
    "services.d.ts":
      'import type { ServiceCollection } from "@tsazor/runtime";\n/** Registers the services the Fluent components use (the `Toaster` and the `DialogService`): `createTsazorApp({ services: addFluent })`. */\nexport declare function addFluent(services: ServiceCollection): void;\n',
  },
  stylesheet: { file: "fluent.css" },
});
if (result.errors.length > 0) process.exit(1);

// The templates (design-extended-library.md §2.4): the copied blocks as sources in templates/.
// Their compiled modules land in dist/templates so an app (the showcase!) can render them live;
// the copies (the CLI's add) carry the .tsazor itself.
const templates = await buildLibrary({
  packageDir: process.cwd(),
  srcDir: "templates",
  outDir: "dist/templates",
  internal: [],
  aliases: {},
  exports: [],
});
if (templates.errors.length > 0) process.exit(1);

// The templates' compiled modules import their components as ../src/<Name>.js (resolved against
// the source tree); in dist/templates they sit as siblings of dist/ — rewrite to ../<Name>.js.
const templatesDir = path.join(process.cwd(), "dist", "templates");
for (const file of readdirSync(templatesDir)) {
  if (!file.endsWith(".js")) continue;
  const source = readFileSync(path.join(templatesDir, file), "utf8");
  const fixed = source.replace(/from "\.\.\/src\/([A-Za-z0-9_-]+)\.js"/g, 'from "../$1.js"');
  if (fixed !== source) writeFileSync(path.join(templatesDir, file), fixed);
}
