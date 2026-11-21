/** The codes `tsazor check` and the language server report themselves, around the compiler's. */
export const CHECK_CODES = {
  /** The project's tsconfig leaves `strict` (or one of its flags) off. */
  notStrict: "TZS033",
  /** A `.tsazor` file could not be read. */
  unreadable: "TZS034",
  /** The compiler threw instead of reporting (a bug in Tsazor). */
  compilerFailure: "TZS035",
  /** A package's component manifest is unreadable, or newer than this Tsazor reads. */
  manifest: "TZS036",
  /** A text field bound to a number, a Decimal or a date that can be null (the type layer reads the declared type, B46). */
  textBind: "TZS040",
} as const;
