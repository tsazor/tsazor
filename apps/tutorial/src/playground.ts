/**
 * The playground's project rules: the start project, which file names are
 * allowed, and what a new file starts with. No saving yet — the files live
 * in TutorialState until the page reloads.
 */
import type { LessonFiles } from "./content-types";

/** The component the preview starts; it can't be renamed or deleted. */
export const ENTRY = "App.tsazor";

export const STARTER: LessonFiles = {
    "App.tsazor": [
        "<h1>Hello @name!</h1>",
        "",
        '<button @onclick="increment">Clicked @count @(count === 1 ? "time" : "times")</button>',
        "",
        "@code {",
        '    name = "world";',
        "    count = 0;",
        "",
        "    increment() {",
        "        this.count++;",
        "    }",
        "}",
        "",
    ].join("\n"),
    "App.tsazor.css": ["h1 {", "    color: #6d28d9;", "}", ""].join("\n"),
};

const EXTENSIONS = [".tsazor.css", ".tsazor.ts", ".tsazor", ".css", ".ts"];

/** Why `name` can't be a new file name (or the new name of `current`); undefined when it can. */
export function fileNameProblem(name: string, files: LessonFiles, current?: string): string | undefined {
    if (name.length === 0) return "Enter a file name.";
    if (!/^[A-Za-z_][\w.-]*$/.test(name)) return "Use letters, digits, '-', '_' and '.' (no folders).";
    if (!EXTENSIONS.some((extension) => name.endsWith(extension) && name.length > extension.length)) {
        return "End it in .tsazor, .ts or .css (.tsazor.css for a component's own styles).";
    }
    if (name.endsWith(".tsazor") && !/^[A-Z]/.test(name)) return "A component's name starts with a capital letter (it is its tag).";
    if (name !== current && name in files) return `There is already a ${name}.`;
    return undefined;
}

/** What a new file starts with. */
export function templateFor(name: string): string {
    if (name.endsWith(".tsazor")) {
        const tag = name.slice(0, -".tsazor".length);
        return [`<p>${tag}</p>`, "", "@code {", "}", ""].join("\n");
    }
    if (name.endsWith(".tsazor.ts")) {
        const tag = name.slice(0, -".tsazor.ts".length);
        return [`import { ComponentBase } from "@tsazor/runtime";`, "", `export default class ${tag}Base extends ComponentBase {`, "}", ""].join("\n");
    }
    return "";
}

/** The files with `from` renamed to `to`, in the same order. */
export function renameFile(files: LessonFiles, from: string, to: string): LessonFiles {
    return Object.fromEntries(Object.entries(files).map(([name, text]) => [name === from ? to : name, text]));
}
