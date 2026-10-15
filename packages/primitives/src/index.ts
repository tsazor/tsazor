/**
 * `@tsazor/primitives` — feel-at-home value types for .NET developers in
 * TypeScript (design-extensions-primitives.md): immutable, zero-dependency,
 * written in idiomatic TypeScript with recognizable .NET concepts. Useful to
 * everyone, not only to teams with a .NET backend.
 *
 * `@tsazor/dotnet` maps OpenAPI `format: decimal`/`date`/`duration`/`uuid` to
 * `Decimal`/`DateOnly`/`TimeSpan`/`Guid` by default (decision X4); all five
 * serialize to a string on the wire (`toJSON`).
 */
export { Decimal, type MidpointRounding } from "./decimal.js";
export { DateOnly } from "./date-only.js";
export { TimeOnly } from "./time-only.js";
export { TimeSpan } from "./time-span.js";
export { Guid } from "./guid.js";
