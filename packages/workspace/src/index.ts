// Workspace-level resolution shared by the Vite plugin and the language server
export {
  collectImports,
  collectImportsSync,
  candidateDirs,
  checkUsing,
  enclosingDirs,
  findPackageDir,
  inheritedImports,
  isPathLikeUsing,
  rebaseSpecifier,
  relativeSpecifier,
  usingDirs,
  type ImportsChain,
  type ImportsLayer,
} from "./imports.js";
export { createFileContext, classNameForFile, resolutionOptions, type FileContext } from "./resolver.js";
export { exportsOfFile, importKindOf, packageExports } from "./exports.js";
export { RUNTIME_PACKAGE, RUNTIME_COMPONENTS, RUNTIME_TYPES } from "./builtins.js";
export {
  MetadataCache,
  defaultMetadataCache,
  componentMetadataForTag,
  buildPackageManifest,
  buildRuntimeManifest,
  componentTypeDeclaration,
  componentTypeDeclarations,
  manifestEntriesOfModule,
  type ManifestEntry,
  type MetadataCacheOptions,
} from "./metadata.js";
export { mapPath } from "./path-mapping.js";
export { RUNTIME_MANIFEST } from "./runtime-manifest.generated.js";
