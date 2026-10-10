/**
 * The skin's own icons (src/core-icons.ts) are copies of @tsazor/bootstrap-icons' values: after an update of the set,
 * `pnpm --filter @tsazor/bootstrap core-icons` writes them again.
 */
import { describe, expect, it } from "vitest";
import * as Icons from "@tsazor/bootstrap-icons";
import * as CoreIcons from "../src/core-icons";

describe("core icons", () => {
  it("are the generated set's values", () => {
    const names = Object.keys(CoreIcons);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(CoreIcons[name as keyof typeof CoreIcons], name).toEqual((Icons as Record<string, unknown>)[name]);
    }
  });
});
