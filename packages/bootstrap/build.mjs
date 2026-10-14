/**
 * Library build for @tsazor/bootstrap through `buildLibrary` (@tsazor/cli): the components, the helpers, the manifest
 * and the declarations, and tsazor-bootstrap.css — the sidecar CSS of the components Bootstrap has no classes for
 * (Timeline, …), in its variables, imported after bootstrap.css.
 */
import { buildLibrary } from "@tsazor/cli";

const result = await buildLibrary({
  // Compiled for the components that use them, not exported (DataGrid's Defer).
  internal: ["Defer", "TreeViewNode", "ChipContent", "WizardStepHeader", "WizardFormLink"],
  // Extra export names for a component (D-C3): Bootstrap calls the dialog a modal.
  aliases: { Modal: "Dialog", Menu: "Dropdown", MenuItem: "DropdownItem", MultiSplitter: "Splitter", MultiSplitterPane: "SplitterPane" },
  exports: [
    // Plain helpers the package exports besides its components.
    'export { tooltip } from "./tooltip-attachment.js"',
    // What an Autocomplete's onOptionsSearch handler gets.
    'export { OptionsSearchEventArgs } from "@tsazor/ui"',
    // The services the components use, in one call (package.json `tsazor.setup` names it).
    'export { addBootstrap } from "./services.js"',
    // The toast service comes with the skin: register it, inject it, call show().
    'export { Toaster } from "@tsazor/ui"',
    // Dialogs opened from code: the service and the reference a dialog closes (MudBlazor's IDialogService).
    'export { DialogReference, DialogService } from "@tsazor/ui"',
    // An app's own icons (`icon(name, svg)`), so it needs no other package for them.
    'export { icon } from "@tsazor/ui"',
    // The DataGrid's sorting and paging state come with the skin too.
    'export { GridSort, PaginationState } from "@tsazor/ui"',
    // FileUpload's uploader (`uploadTo(url)`) and file sizes.
    'export { formatFileSize, uploadFile, uploadTo } from "@tsazor/ui"',
  ],
  // The types the components' parameters name come with the skin: `@import type { Intent } from "@tsazor/bootstrap"`.
  reexportTypes: ["@tsazor/ui"],
  typeExports: [
    // And the types of the services and the grid model it re-exports.
    'export type { DialogOptions, DialogParameters, DialogResult, GridItemsProviderRequest, GridItemsProviderResult, HexColor, SortDirection, SortedProperty, ToastAction, ToastEntry, ToastOptions } from "@tsazor/ui"',
  ],
  // The exported helpers' declarations, with their docs.
  declarations: {
    "tooltip-attachment.d.ts":
      'import type { Attachment } from "@tsazor/runtime";\nimport type { Placement } from "@tsazor/ui";\n/** A Bootstrap tooltip on any element: `<button @attach="tooltip(\'Save\')">`; the same text gives the same attachment. */\nexport declare function tooltip(text: string, placement?: Placement): Attachment<HTMLElement>;\n',
    "services.d.ts":
      'import type { ServiceCollection } from "@tsazor/runtime";\n/** Registers the services the Bootstrap components use (the `Toaster` and the `DialogService`): `createTsazorApp({ services: addBootstrap })`. */\nexport declare function addBootstrap(services: ServiceCollection): void;\n',
  },
  stylesheet: { file: "tsazor-bootstrap.css", header: "/* @tsazor/bootstrap: the components Bootstrap has no classes for, in its variables. */\n" },
});
if (result.errors.length > 0) process.exit(1);
