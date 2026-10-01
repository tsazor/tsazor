/**
 * Parameter metadata over the file system (roadmap 2.1): tag lookup through
 * the resolver, inheritance across .tsazor/.ts files and into the runtime
 * manifest, package manifests (generation round trip), cache invalidation
 * and the generated runtime manifest's sync with the runtime sources.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildPackageManifest,
  buildRuntimeManifest,
  collectImports,
  createFileContext,
  MetadataCache,
  RUNTIME_COMPONENTS,
  RUNTIME_MANIFEST,
  resolutionOptions,
} from "../src";
import { componentMetadataForTag } from "../src/metadata";

const here = path.dirname(fileURLToPath(import.meta.url));
let root = "";

const RT_IMPORTS = '@import { Parameter, CascadingParameter, EventCallback, ComponentBase } from "@tsazor/runtime"\n@import type { RenderFragment } from "@tsazor/runtime"\n';

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-meta-"));
  await writeFile(path.join(root, "package.json"), "{}");
  await mkdir(path.join(root, "Shared"), { recursive: true });
  await mkdir(path.join(root, "Pages"), { recursive: true });
  await writeFile(path.join(root, "_Imports.tsazor"), `@using ./Shared\n@using @fake/lib\n${RT_IMPORTS}`);
  await writeFile(
    path.join(root, "Shared", "Greeter.tsazor"),
    '<p>@Name</p>\n@code {\n  /** Who to greet. */\n  @Parameter() Name?: string;\n  @Parameter() NameChanged?: EventCallback<string>;\n  @CascadingParameter({ name: "theme" }) theme?: string;\n}\n',
  );
  // Code-behind chain: Fancy.tsazor → Fancy.tsazor.ts → ./FancyBase.ts → runtime ComponentBase.
  await writeFile(path.join(root, "Shared", "Fancy.tsazor"), "<p></p>\n@code {\n  @Parameter() own = 1;\n}\n");
  await writeFile(
    path.join(root, "Shared", "Fancy.tsazor.ts"),
    'import { Parameter } from "@tsazor/runtime";\nimport { FancyBase } from "./FancyBase";\nexport default class Fancy extends FancyBase {\n  @Parameter() behind?: string;\n}\n',
  );
  await writeFile(
    path.join(root, "Shared", "FancyBase.ts"),
    'import { ComponentBase, Parameter } from "@tsazor/runtime";\nexport class FancyBase extends ComponentBase {\n  @Parameter() fromBase?: string;\n}\n',
  );
  await writeFile(path.join(root, "Shared", "MainLayout.tsazor"), "@inherits LayoutComponentBase\n<main>@Body</main>\n");
  await writeFile(path.join(root, "Shared", "TextBox.tsazor"), "@inherits InputBase<string>\n<input />\n@code {\n  @Parameter() label?: string;\n}\n");
  // A plain .ts component bound by @import.
  await writeFile(
    path.join(root, "Shared", "Plain.ts"),
    'import { ComponentBase, Parameter, type RenderFragment } from "@tsazor/runtime";\nexport class Plain extends ComponentBase {\n  @Parameter() childContent?: RenderFragment;\n}\n',
  );
  // A package with a generated manifest.
  const libDir = path.join(root, "node_modules", "@fake", "lib");
  await mkdir(path.join(libDir, "src"), { recursive: true });
  await mkdir(path.join(libDir, "dist"), { recursive: true });
  await writeFile(path.join(libDir, "_Imports.tsazor"), RT_IMPORTS);
  await writeFile(path.join(libDir, "src", "Chip.tsazor"), "<span></span>\n@code {\n  @Parameter() label = \"\";\n  @Parameter() onRemove?: EventCallback<MouseEvent>;\n}\n");
  await writeFile(path.join(libDir, "dist", "index.js"), 'export { default as Chip } from "./Chip.js";\n');
  await writeFile(
    path.join(libDir, "package.json"),
    JSON.stringify({ name: "@fake/lib", exports: { ".": "./dist/index.js" }, tsazor: { components: "./dist/tsazor-components.json" } }),
  );
  const manifest = buildPackageManifest({ packageDir: libDir, packageName: "@fake/lib", entries: [{ exportName: "Chip", file: path.join(libDir, "src", "Chip.tsazor") }] });
  await writeFile(path.join(libDir, "dist", "tsazor-components.json"), JSON.stringify(manifest));
});

afterAll(() => rm(root, { recursive: true, force: true }));

const contextFor = async (relative: string) => {
  const file = path.join(root, relative);
  return createFileContext(file, await collectImports(path.dirname(file), root));
};
const names = (metadata: { parameters: Array<{ name: string }> } | null | undefined) => metadata?.parameters.map((p) => p.name);

describe("resolveComponentMetadata (FileContext)", () => {
  it("resolves folder components, runtime built-ins and package components", async () => {
    const context = await contextFor("Pages/Home.tsazor");
    const greeter = context.resolveComponentMetadata("Greeter", []);
    expect(names(greeter)).toEqual(["Name", "NameChanged", "theme"]);
    expect(greeter?.parameters[0]).toMatchObject({ category: "string", doc: "Who to greet." });
    expect(greeter?.parameters[2]?.cascading).toEqual({ name: "theme" });
    expect(names(context.resolveComponentMetadata("NavLink", []))).toEqual(["href", "match", "activeClass", "cssClass", "childContent"]);
    const chip = context.resolveComponentMetadata("Chip", []);
    expect(chip?.parameters.map((p) => [p.name, p.category])).toEqual([["label", "string"], ["onRemove", "EventCallback<T>"]]);
    expect(chip?.file).toBe(path.join(root, "node_modules", "@fake", "lib", "src", "Chip.tsazor"));
    expect(context.resolveComponentMetadata("Nope", [])).toBeNull();
  });

  it("resolves tags bound by @import (plain .ts component classes)", async () => {
    const context = await contextFor("Pages/Home.tsazor");
    const imports = [{ specifier: "../Shared/Plain", bindings: [{ local: "Plain", imported: "Plain", typeOnly: false }] }];
    expect(context.resolveComponentMetadata("Plain", [], imports)?.parameters.map((p) => p.category)).toEqual(["RenderFragment"]);
    expect(resolutionOptions(context).resolveComponentMetadata?.("Plain", [], imports)?.name).toBe("Plain");
  });

  it("flattens code-behind and base classes across files", async () => {
    const context = await contextFor("Pages/Home.tsazor");
    const fancy = context.resolveComponentMetadata("Fancy", []);
    expect(fancy?.parameters.map((p) => [p.name, p.declaredBy])).toEqual([
      ["fromBase", "FancyBase"],
      ["behind", "Fancy"],
      ["own", "Fancy"],
    ]);
    expect(fancy?.isComponent).toBe(true);
  });

  it("inherits from runtime bases through the runtime manifest (with type arguments)", async () => {
    const context = await contextFor("Pages/Home.tsazor");
    expect(names(context.resolveComponentMetadata("MainLayout", []))).toEqual(["Body"]);
    const textBox = context.resolveComponentMetadata("TextBox", []);
    expect(textBox?.parameters.find((p) => p.name === "Value")).toMatchObject({ category: "string", type: "string" });
    expect(textBox?.parameters.find((p) => p.name === "ValueChanged")).toMatchObject({ typeArgument: "string" });
    expect(names(textBox)).toEqual(["Value", "ValueChanged", "ValueExpression", "editContext", "additionalAttributes", "label"]);
  });
});

describe("MetadataCache invalidation", () => {
  const bump = async (file: string, content: string, seconds: number): Promise<void> => {
    await writeFile(file, content);
    const time = new Date(Date.now() + seconds * 1000);
    await utimes(file, time, time);
  };

  it("re-resolves after edits of the component, its code-behind and its base", async () => {
    const dir = path.join(root, "Cache");
    await mkdir(dir, { recursive: true });
    const component = path.join(dir, "Widget.tsazor");
    const codeBehind = `${component}.ts`;
    const base = path.join(dir, "WidgetBase.ts");
    await writeFile(component, "@code {\n  @Parameter() a?: string;\n}\n");
    await writeFile(base, 'import { ComponentBase, Parameter } from "@tsazor/runtime";\nexport class WidgetBase extends ComponentBase {\n  @Parameter() b?: string;\n}\n');
    const cache = new MetadataCache();
    expect(names(cache.componentOfFile(component))).toEqual(["a"]);
    const first = cache.componentOfFile(component);
    expect(cache.componentOfFile(component)).toBe(first); // cached

    // Code-behind appears: the generated class now extends it.
    await bump(codeBehind, 'import { Parameter } from "@tsazor/runtime";\nimport { WidgetBase } from "./WidgetBase";\nexport default class W extends WidgetBase {\n  @Parameter() c?: string;\n}\n', 2);
    expect(names(cache.componentOfFile(component))).toEqual(["b", "c", "a"]);
    expect(cache.dependenciesOf(component)).toEqual(expect.arrayContaining([component, codeBehind, base]));
    expect(cache.dependentsOf(base)).toEqual([component]);

    await bump(base, 'import { ComponentBase, Parameter } from "@tsazor/runtime";\nexport class WidgetBase extends ComponentBase {\n  @Parameter() b2?: string;\n}\n', 4);
    expect(names(cache.componentOfFile(component))).toEqual(["b2", "c", "a"]);

    await bump(codeBehind, 'import { Parameter } from "@tsazor/runtime";\nimport { WidgetBase } from "./WidgetBase";\nexport default class W extends WidgetBase {\n  @Parameter() c2?: string;\n}\n', 6);
    expect(names(cache.componentOfFile(component))).toEqual(["b2", "c2", "a"]);

    await bump(component, "@code {\n  @Parameter() a2?: string;\n}\n", 8);
    expect(names(cache.componentOfFile(component))).toEqual(["b2", "c2", "a2"]);

    expect(cache.invalidate(base)).toEqual([component]);
    expect(cache.dependentsOf(base)).toEqual([]);
  });

  it("serves tag lookups from an explicit cache", async () => {
    const context = await contextFor("Pages/Home.tsazor");
    const cache = new MetadataCache();
    expect(names(componentMetadataForTag(context, "Greeter", [], [], cache))).toEqual(["Name", "NameChanged", "theme"]);
    expect(cache.dependenciesOf(path.join(root, "Shared", "Greeter.tsazor"))).toEqual(
      expect.arrayContaining([path.join(root, "Shared", "Greeter.tsazor"), path.join(root, "_Imports.tsazor")]),
    );
  });
});

describe("runtime manifest", () => {
  const runtimeDir = path.resolve(here, "../../runtime");

  it("src/runtime-manifest.generated.ts matches the runtime sources", () => {
    expect(buildRuntimeManifest(runtimeDir)).toEqual(JSON.parse(JSON.stringify(RUNTIME_MANIFEST)));
  });

  it("the generator's --check agrees", () => {
    const script = path.resolve(here, "../scripts/gen-runtime-manifest.mjs");
    expect(() => execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("RUNTIME_COMPONENTS are the manifest's concrete components", () => {
    expect([...RUNTIME_COMPONENTS].sort()).toEqual(
      [
        "AuthorizeRouteView", "AuthorizeView", "CascadingAuthenticationState", "CascadingValue", "DataAnnotationsValidator", "DynamicComponent", "EditForm",
        "ErrorBoundary",
        "FocusOnNavigate",
        "HeadContent", "HeadOutlet",
        "InputCheckbox", "InputDate", "InputFile", "InputNumber", "InputSelect", "InputText", "InputTextArea", "LayoutView",
        "NavLink", "NavigationLock", "PageTitle", "RouteView", "Router", "SectionContent", "SectionOutlet", "SectionOutletContentRenderer",
        "ValidationMessage", "ValidationSummary", "Virtualize",
      ].sort(),
    );
    for (const name of ["ComponentBase", "InputBase", "LayoutComponentBase"]) expect(RUNTIME_MANIFEST.components[name]?.abstract).toBe(true);
  });
});
