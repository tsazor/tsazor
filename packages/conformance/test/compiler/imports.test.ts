/**
 * Explicit imports (roadmap A3). Review §4: I1 (runtime-type name collisions),
 * I2 (imported names baked to this.X), I3 (default vs named from the file
 * name), I4 (bare-package trust / ambiguous tags).
 */
import { describe, expect, it } from "vitest";
import { diagnosticsOf, errorCodes, mount } from "../harness.js";

const UTILS = `export enum Status { Open = "open", Done = "done" }
export const MAX_ITEMS = 3;
export function formatDate(day: string): string { return "on " + day; }
export default function shout(text: string): string { return text.toUpperCase() + "!"; }
`;

describe("I2 — @import names are free names in markup and @code", () => {
  it("an imported enum member renders in markup", async () => {
    const m = await mount({ "Test.tsazor": `@import { Status } from "./utils"\n<p>@Status.Open</p>`, "utils.ts": UTILS });
    expect(m.html()).toBe("<p>open</p>");
  });

  it("an imported helper function is callable from markup and @code", async () => {
    const m = await mount({
      "Test.tsazor": `@import { formatDate, MAX_ITEMS } from "./utils"
<p>@formatDate(day)|@label|@MAX_ITEMS</p>
@code {
    private day = "monday";
    private get label(): string { return formatDate("friday"); }
}`,
      "utils.ts": UTILS,
    });
    expect(m.html()).toBe("<p>on monday|on friday|3</p>");
  });

  it("default, aliased, namespace and multi-line imports", async () => {
    const m = await mount({
      "Test.tsazor": `@import shout, { formatDate as fmt } from "./utils"
@import * as utils from "./utils"
@import {
    Status,
    MAX_ITEMS,
} from "./utils"
<p>@shout("hi")|@fmt("x")|@utils.Status.Done|@Status.Open|@MAX_ITEMS</p>`,
      "utils.ts": UTILS,
    });
    expect(m.html()).toBe("<p>HI!|on x|done|open|3</p>");
  });

  it("an @import in _Imports.tsazor is inherited, relative to the _Imports file", async () => {
    const m = await mount(
      {
        "_Imports.tsazor": `@import { Status, formatDate } from "./lib/utils"`,
        "lib/utils.ts": UTILS,
        "Pages/Test.tsazor": `<p>@Status.Done @formatDate(day)</p>\n@code { private day = "sunday"; }`,
      },
      "Pages/Test.tsazor",
    );
    expect(m.html()).toBe("<p>done on sunday</p>");
  });

  it("a file's own @import shadows the inherited binding", async () => {
    const m = await mount(
      {
        "_Imports.tsazor": `@import { formatDate } from "./utils"`,
        "utils.ts": UTILS,
        "other.ts": `export function formatDate(day: string): string { return "other " + day; }\n`,
        "Test.tsazor": `@import { formatDate } from "./other"\n<p>@formatDate("x")</p>`,
      },
    );
    expect(m.html()).toBe("<p>other x</p>");
  });

  it("an imported component class is usable as a tag", async () => {
    const m = await mount({
      "Test.tsazor": `@import Badge from "./widgets/Badge.tsazor"\n<Badge Text="new" />`,
      "widgets/Badge.tsazor": `<span class="badge">@Text</span>\n@code { @Parameter() Text = ""; }`,
    });
    expect(m.html()).toBe('<span class="badge">new</span>');
  });
});

describe("I1 — no import guessing from runtime type names", () => {
  it("a PascalCase parameter named like a runtime type stays a member", async () => {
    const m = await mount(`<p>@Token|@RouteData</p>\n@code { @Parameter() Token = "t-1"; @Parameter() RouteData = "r"; }`);
    expect(m.html()).toBe("<p>t-1|r</p>");
  });
});

describe("I3 — @inherits/@inject types import the target's real export", () => {
  it("a named-only export (no default to guess)", async () => {
    const m = await mount({
      "_Imports.tsazor": "@using ./bases",
      "bases/Clocked.ts": `import { ComponentBase } from "@tsazor/runtime";
export class Clocked extends ComponentBase { protected now(): string { return "12:00"; } }
`,
      "Test.tsazor": `@inherits Clocked\n<p>@now()</p>`,
    });
    expect(m.html()).toBe("<p>12:00</p>");
  });

  it("a default-only export", async () => {
    const m = await mount({
      "Clocked.ts": `import { ComponentBase } from "@tsazor/runtime";
export default class extends ComponentBase { protected now(): string { return "13:00"; } }
`,
      "Test.tsazor": `@inherits Clocked\n<p>@now()</p>`,
    });
    expect(m.html()).toBe("<p>13:00</p>");
  });
});

describe("I4 / A3 diagnostics", () => {
  it("an invalid @import is a compile error (TZS016)", async () => {
    expect(errorCodes(await diagnosticsOf(`@import { Status from "./utils"\n<p>x</p>`))).toEqual(["TZS016"]);
  });

  it("a tag found in two @using directories is ambiguous (TZS017)", async () => {
    const diagnostics = await diagnosticsOf(`<Chip />`, {
      "_Imports.tsazor": "@using ./A\n@using ./B",
      "A/Chip.tsazor": "<span>a</span>",
      "B/Chip.tsazor": "<span>b</span>",
    });
    expect(errorCodes(diagnostics)).toEqual(["TZS017"]);
  });

  it("a @using directory that does not exist is a warning (TZS018)", async () => {
    const diagnostics = await diagnosticsOf(`@using ./Nowhere\n<p>x</p>`);
    expect(diagnostics.map((d) => `${d.severity}:${d.code}`)).toEqual(["warning:TZS018"]);
  });
});
