// Workspace-level resolution shared by the Vite plugin and the language server
export {
  collectImports,
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
export { RUNTIME_PACKAGE, RUNTIME_COMPONENTS, RUNTIME_TYPES, RUNTIME_COMPONENT_PARAMS } from "./builtins.js";
