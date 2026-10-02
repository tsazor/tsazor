/**
 * Paths of the type check's in-memory file system — shared by the checker
 * (worker, test) and the build-time environment collector (Node, which must
 * not import the checker: it pulls in the compiler and the JSON manifests).
 */

/** Absolute path → content of the type files (lib d.ts, package d.ts + package.json). */
export type TypeEnvironment = Readonly<Record<string, string>>;

/** Project files live here (`/app/App.tsazor.gen.ts`). */
export const APP_ROOT = "/app/";

/** TypeScript's lib files (`/lib/lib.es2022.d.ts`). */
export const LIB_ROOT = "/lib/";
