/**
 * The skin's own icons (src/core-icons.ts, Fluent UI Blazor's CoreIcons) are copies of @tsazor/fluent-icons' values:
 * after an update of the set, `pnpm --filter @tsazor/fluent core-icons` writes them again.
 */
import { describe, expect, it } from "vitest";
import * as Icons from "@tsazor/fluent-icons";
import * as CoreIcons from "../src/core-icons";

describe("core icons", () => {
  it("are the generated set's values (Dismiss20Regular is Icons.Regular.Size20.Dismiss)", () => {
    const sets = Icons as unknown as Record<string, Record<string, Record<string, unknown>>>;
    const names = Object.keys(CoreIcons);
    expect(names.length).toBeGreaterThan(0);
    for (const exportName of names) {
      const [, name, size, variant] = /^(.+?)(\d+)(Regular|Filled)$/.exec(exportName) ?? [];
      expect(CoreIcons[exportName as keyof typeof CoreIcons], exportName).toEqual(sets[variant!]?.[`Size${size}`]?.[name!]);
    }
  });
});
