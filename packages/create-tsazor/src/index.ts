#!/usr/bin/env node
/**
 * create-tsazor — `npm create tsazor@latest my-app [-- --ui <package>]`
 * (docs/design-create-tsazor.md). Asks only when stdin is a terminal.
 */
import { main } from "./cli.js";
import { createPrompter } from "./prompt.js";

const prompter = process.stdin.isTTY && process.stdout.isTTY ? createPrompter() : undefined;
try {
  process.exitCode = await main(process.argv.slice(2), { stdout: (line) => console.log(line), prompter });
} finally {
  prompter?.close();
}
