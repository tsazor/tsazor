import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("the Trusted Types default policy", () => {
  it("passes same-origin script URLs only, and is installed once", async () => {
    let rules: { createScriptURL(input: string): string } | undefined;
    const createPolicy = vi.fn((_name: string, policy: typeof rules) => {
      rules = policy;
    });
    vi.stubGlobal("trustedTypes", { defaultPolicy: null, createPolicy });
    vi.stubGlobal("location", { href: "https://bakery.example/orders", origin: "https://bakery.example" });
    const { ensureWorkerPolicy } = await import("../src/trusted-types");
    ensureWorkerPolicy();
    ensureWorkerPolicy();
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(createPolicy.mock.calls[0]![0]).toBe("default");
    expect(rules!.createScriptURL("/assets/csv.worker-abc.js")).toBe("https://bakery.example/assets/csv.worker-abc.js");
    expect(() => rules!.createScriptURL("https://evil.example/x.js")).toThrow(/same-origin/);
    expect(Object.keys(rules!)).toEqual(["createScriptURL"]);
  });

  it("leaves an existing default policy alone", async () => {
    const createPolicy = vi.fn();
    vi.stubGlobal("trustedTypes", { defaultPolicy: {}, createPolicy });
    const { ensureWorkerPolicy } = await import("../src/trusted-types");
    ensureWorkerPolicy();
    expect(createPolicy).not.toHaveBeenCalled();
  });
});
