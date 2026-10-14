/** The codes `tsazor check` and the language server report themselves, around the compiler's. */
export const CHECK_CODES = {
  /** The project's tsconfig leaves `strict` (or one of its flags) off. */
  notStrict: "TZS033",
  /** A `.tsazor` file could not be read. */
  unreadable: "TZS034",
  /** The compiler threw instead of reporting (a bug in Tsazor). */
  compilerFailure: "TZS035",
} as const;
