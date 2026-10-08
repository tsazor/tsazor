/**
 * The questions the starter asks when stdin is a terminal — plain
 * `node:readline`, no dependency.
 */
import { createInterface } from "node:readline/promises";

export interface Prompter {
  /** Asks for text; an empty answer takes `fallback`. */
  text(question: string, fallback: string): Promise<string>;
  /** Asks yes or no; an empty answer takes `fallback`. */
  confirm(question: string, fallback: boolean): Promise<boolean>;
  /** Shows numbered options and returns the index of the chosen one (the first by default). */
  choose(question: string, options: readonly string[]): Promise<number>;
  close(): void;
}

/** A prompter on stdin/stdout; Ctrl+C ends the starter without writing anything more. */
export function createPrompter(input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): Prompter {
  const readline = createInterface({ input, output });
  readline.on("SIGINT", () => {
    output.write("\n");
    process.exit(130);
  });
  return {
    async text(question, fallback) {
      const answer = (await readline.question(fallback ? `${question} (${fallback}): ` : `${question}: `)).trim();
      return answer === "" ? fallback : answer;
    },
    async confirm(question, fallback) {
      for (;;) {
        const answer = (await readline.question(`${question} ${fallback ? "(Y/n)" : "(y/N)"} `)).trim().toLowerCase();
        if (answer === "") return fallback;
        if (answer === "y" || answer === "yes") return true;
        if (answer === "n" || answer === "no") return false;
      }
    },
    async choose(question, options) {
      output.write(`${question}\n${options.map((option, index) => `  ${index + 1}) ${option}`).join("\n")}\n`);
      for (;;) {
        const answer = (await readline.question(`Choose 1–${options.length} (1): `)).trim();
        if (answer === "") return 0;
        const index = Number(answer) - 1;
        if (Number.isInteger(index) && index >= 0 && index < options.length) return index;
      }
    },
    close() {
      readline.close();
    },
  };
}
