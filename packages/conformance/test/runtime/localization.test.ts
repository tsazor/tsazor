/**
 * E8 localization (design-localization.md): CultureInfo/CultureService/StringLocalizer
 * semantics, the auto-render extension (§3), localized validation messages (§4)
 * and `@bind:culture` (§5) — end to end through the compiler pipeline where the
 * markup carries the feature (@inject, @bind:culture), unit-level where the
 * surface is a service API. Invariant behavior is asserted alongside every
 * culture path (A5/B7: culture only at the display/input boundary).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CultureService,
  type CultureChangedEventArgs,
  CultureInfo,
  EditContext,
  EmailAddress,
  enableDataAnnotationsValidation,
  formatMessage,
  formatValue,
  MinLength,
  parseValue,
  Range,
  Required,
  type ComponentBase,
  ServiceCollection,
  StringLocalizer,
  type Token,
} from "@tsazor/runtime";
import {
  Renderer,
} from "@tsazor/runtime/internal";
import { compileFiles, diagnosticsOf, errorCodes, mount, normalizeHtml } from "../harness.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CultureInfo (E8 §1)", () => {
  it("the invariant culture (name \"\") formats fixed to en-US — no Intl locale negotiation", () => {
    expect(CultureInfo.invariant.name).toBe("");
    expect(CultureInfo.invariant.formatNumber(1234.5)).toBe("1,234.5");
    expect(CultureInfo.invariant.displayName).toBe("Invariant Language (Invariant Country)");
  });

  it("a culture formats numbers through Intl", () => {
    const de = new CultureInfo("de-DE");
    expect(de.name).toBe("de-DE");
    expect(de.formatNumber(1234.5)).toBe("1.234,5");
    expect(de.displayName).toBe("Deutsch (Deutschland)");
  });

  it("a malformed tag throws at construction (CultureNotFoundException)", () => {
    expect(() => new CultureInfo("not a locale!")).toThrow("not a valid culture name");
    expect(() => new CultureInfo(undefined as unknown as string)).toThrow("expected a locale string");
  });

  it("formatValue/parseValue accept a culture tag or a CultureInfo (internal normalization)", () => {
    const de = new CultureInfo("de-DE");
    expect(formatValue(1234.5, undefined, "de-DE")).toBe("1.234,5");
    expect(formatValue(1234.5, undefined, de)).toBe("1.234,5");
    expect(parseValue("1.234,5", undefined, de)).toBe(1234.5);
  });
});

describe("CultureService (E8 §1, D-L1) — priority and lock", () => {
  it("profile applies until an explicit selection locks it out (port-findings R.1)", () => {
    const culture = new CultureService("en-US");
    expect(culture.current.name).toBe("en-US");
    expect(culture.setFromProfile("de-DE")).toBe(true);
    expect(culture.current.name).toBe("de-DE");
    expect(culture.setExplicit("fr-FR")).toBeUndefined();
    expect(culture.current.name).toBe("fr-FR");
    // The port's priority rule: once explicit, profile values are locked out.
    expect(culture.setFromProfile("es-ES")).toBe(false);
    expect(culture.current.name).toBe("fr-FR");
  });

  it("a change notification carries previous, current and reason; a repeat set is a no-op", () => {
    const culture = new CultureService("en-US");
    const events: CultureChangedEventArgs[] = [];
    const unsubscribe = culture.subscribe((event) => events.push(event));
    expect(culture.setFromProfile("de-DE")).toBe(true);
    culture.setFromProfile("de-DE"); // same culture → change() is silent
    expect(events).toHaveLength(1);
    expect(events[0]!.previous.name).toBe("en-US");
    expect(events[0]!.current.name).toBe("de-DE");
    expect(events[0]!.reason).toBe("profile");
    unsubscribe();
    culture.setExplicit("fr-FR");
    expect(events).toHaveLength(1);
  });

  it("setDefault never overrides a stronger selection (the app default is lowest priority)", () => {
    const culture = new CultureService("en-US");
    culture.setExplicit("de-DE");
    culture.setDefault("fr-FR");
    expect(culture.current.name).toBe("de-DE");
  });

  it("setDefault applies while the culture is still the default, and stays below a profile value", () => {
    const culture = new CultureService("en-US");
    const events: CultureChangedEventArgs[] = [];
    culture.subscribe((event) => events.push(event));
    culture.setDefault("fr-FR");
    expect(culture.current.name).toBe("fr-FR");
    expect(events.map((event) => event.reason)).toEqual(["default"]);
    culture.setDefault("it-IT");
    expect(culture.current.name).toBe("it-IT");

    culture.setFromProfile("de-DE");
    culture.setDefault("es-ES");
    expect(culture.current.name).toBe("de-DE");
  });
});

const TABLES = {
  "en-US": {
    Greeting: "Hello",
    "Shop.Items": "{count} items",
    "Shop.Braces": "a {{literal}} brace",
    "Order.EmailAddress": "The field '{displayName}' is not a valid e-mail address.",
    "tsazor.validation.required": "The field '{displayName}' is required.",
    "tsazor.validation.range": "The field {displayName} must be between {min} and {max}.",
  },
  "de-DE": {
    Greeting: "Hallo",
    "Shop.Items": "{count} Artikel",
    "Order.EmailAddress": "Das Feld '{displayName}' ist keine gültige E-Mail-Adresse.",
    "tsazor.validation.required": "Das Feld '{displayName}' ist ein Pflichtfeld.",
    "tsazor.validation.range": "Das Feld {displayName} muss zwischen {min} und {max} liegen.",
  },
};

describe("StringLocalizer (E8 §2)", () => {
  it("translates for the current culture, falls back to the default culture, then the key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const culture = new CultureService("de-DE");
    const localizer = new StringLocalizer({ culture, tables: TABLES, defaultCulture: "en-US" });
    expect(localizer.culture).toBe("de-DE");
    expect(localizer.get("Greeting")).toBe("Hallo");
    // de-DE has no "Shop.Braces" → the default culture's entry.
    expect(localizer.get("Shop.Braces")).toBe("a {literal} brace");
    // Missing everywhere → the key, never a throw (port-findings R.1).
    expect(localizer.get("No.Such.Key")).toBe("No.Such.Key");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    localizer.dispose();
  });

  it("walks the parent cultures before the default, as .NET's resource lookup does (fr-FR finds a neutral fr table)", () => {
    // BlazorHero's resources are neutral (Login.fr.resx) and its cultures specific (fr-FR).
    const culture = new CultureService("fr-CA");
    const localizer = new StringLocalizer({
      culture,
      tables: { "en-US": { "Login.Title": "Sign In", "Login.Help": "Help" }, fr: { "Login.Title": "Connexion" }, "fr-CA": { "Login.Help": "Aide" } },
      defaultCulture: "en-US",
    });
    expect(localizer.get("Login.Help")).toBe("Aide");
    expect(localizer.get("Login.Title")).toBe("Connexion");
    culture.setExplicit("de-DE");
    expect(localizer.get("Login.Title")).toBe("Sign In");
    localizer.dispose();
  });

  it("an empty localizer returns the key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const localizer = new StringLocalizer();
    expect(localizer.get("Anything")).toBe("Anything");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    localizer.dispose();
  });

  it("tables require a defaultCulture", () => {
    expect(() => new StringLocalizer({ tables: { "en-US": { A: "a" } } })).toThrow("require a defaultCulture");
  });

  it("named placeholders format (D-L5); {{ }} are literal braces", () => {
    const localizer = new StringLocalizer({ tables: TABLES, defaultCulture: "en-US" });
    expect(localizer.get("Shop.Items", { count: 3 })).toBe("3 items");
    expect(localizer.get("Shop.Braces")).toBe("a {literal} brace");
    expect(formatMessage("{a} + {b}", { a: 1, b: 2 })).toBe("1 + 2");
    // A missing param renders the placeholder text (lenient, never a throw).
    expect(formatMessage("Hi {name}")).toBe("Hi {name}");
    localizer.dispose();
  });

  it("all() is Blazor's GetAllStrings for the current (or given) culture", () => {
    const localizer = new StringLocalizer({ tables: TABLES, defaultCulture: "en-US" });
    expect(localizer.all("de-DE").map((entry) => entry.key)).toEqual([
      "Greeting",
      "Shop.Items",
      "Order.EmailAddress",
      "tsazor.validation.required",
      "tsazor.validation.range",
    ]);
    localizer.dispose();
  });

  it("an async table serves the default culture's entry until it arrives, then notifies", async () => {
    const culture = new CultureService("de-DE");
    let resolveTable: (module: { default: Record<string, string> }) => void = () => {};
    const loader = (): Promise<{ default: Record<string, string> }> =>
      new Promise((resolve) => (resolveTable = resolve));
    const localizer = new StringLocalizer({
      culture,
      tables: { "en-US": TABLES["en-US"]!, "de-DE": loader },
      defaultCulture: "en-US",
    });
    let notified = 0;
    localizer.subscribe(() => notified++);
    expect(localizer.get("Greeting")).toBe("Hello"); // loader in flight → fallback
    resolveTable({ default: { Greeting: "Hallo (async)" } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(localizer.get("Greeting")).toBe("Hallo (async)");
    expect(notified).toBe(1); // the arrival is a re-render source (auto-render, D-L6)
    localizer.dispose();
  });

  it("a culture change notifies the localizer's subscribers until dispose", () => {
    const culture = new CultureService("en-US");
    const localizer = new StringLocalizer({ culture, tables: TABLES, defaultCulture: "en-US" });
    let notified = 0;
    localizer.subscribe(() => notified++);
    culture.setExplicit("de-DE");
    expect(notified).toBe(1);
    localizer.dispose();
    culture.setExplicit("fr-FR"); // dispose ended the culture subscription
    expect(notified).toBe(1);
  });
});

/** Boots a compiled component with the E8 registrations (the app.ts wiring). */
async function mountLocalized(files: Parameters<typeof compileFiles>[0], entry = "Test.tsazor") {
  const compiled = await compileFiles(files);
  const errors = Object.entries(compiled.diagnostics).flatMap(([file, list]) =>
    list.filter((d) => d.severity === "error").map((d) => `${file}: ${d.code} ${d.message}`),
  );
  if (errors.length > 0) throw new Error(`compile errors:\n${errors.join("\n")}`);
  const culture = new CultureService("en-US");
  const collection = new ServiceCollection()
    .registerValue(CultureService as unknown as Token<CultureService>, culture)
    .register(
      StringLocalizer as unknown as Token<StringLocalizer>,
      () => new StringLocalizer({ culture, tables: TABLES, defaultCulture: "en-US" }),
    );
  const renderer = new Renderer(collection.build());
  const failures: unknown[] = [];
  renderer.errorHandler = ({ error }) => failures.push(error);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const { default: Component } = await import(/* @vite-ignore */ compiled.modules[entry]!);
  const state = renderer.renderInContainer(Component as abstract new () => ComponentBase, container);
  const settle = async (): Promise<void> => {
    await renderer.waitUntilIdle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await renderer.waitUntilIdle();
    if (failures.length > 0) throw failures[0];
  };
  await settle();
  const text = (): string => (container.textContent ?? "").replace(/\s+/g, " ").trim();
  return { culture, renderer, container, state, settle, text };
}

describe("auto-render (E8 §3, D-L6) — culture-aware services re-render their injectors", () => {
  it("a component that injects the StringLocalizer re-renders on a culture change without observe()", async () => {
    const { culture, container, settle } = await mountLocalized({
      "Test.tsazor": `@import { StringLocalizer } from "@tsazor/runtime"
@inject StringLocalizer L
<p>@L.get("Greeting")</p>`,
    });
    expect(normalizeHtml(container.innerHTML)).toBe("<p>Hello</p>");
    culture.setExplicit("de-DE");
    await settle();
    expect(normalizeHtml(container.innerHTML)).toBe("<p>Hallo</p>");
  });

  it("a service injected more than once is observed once (field initializers, a lifecycle method that runs again)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { culture, container, settle, text } = await mountLocalized({
      "Test.tsazor": `@import Child from "./Child.tsazor"
<Child round="@round" />
<button @onclick="@(() => round++)">next</button>
@code {
    private round = 1;
}`,
      "Child.tsazor": `@import { inject, StringLocalizer } from "@tsazor/runtime"
@inject StringLocalizer L
<p>@L.get("Greeting") @M.get("Greeting") @round</p>
@code {
    @Parameter() round = 0;
    private readonly M = inject(StringLocalizer);
    protected override onParametersSet(): void {
        this.inject(StringLocalizer);
    }
}`,
    });
    expect(text()).toBe("Hello Hello 1next");
    container.querySelector("button")!.click(); // new parameters: onParametersSet injects again
    await settle();
    culture.setExplicit("de-DE");
    await settle();
    expect(text()).toBe("Hallo Hallo 2next");
    expect(warn.mock.calls.filter(([message]) => String(message).includes("observed twice"))).toEqual([]);
    warn.mockRestore();
  });

  it("injecting the CultureService re-renders as well", async () => {
    const { culture, settle, text } = await mountLocalized({
      "Test.tsazor": `@import { CultureService } from "@tsazor/runtime"
@inject CultureService C
<p>@C.current.name</p>`,
    });
    expect(text()).toBe("en-US");
    culture.setExplicit("de-DE");
    await settle();
    expect(text()).toBe("de-DE");
  });
});

describe("localized validation messages (E8 §4, D-L7)", () => {
  class Order {
    @Required()
    title = "";
    @Range(1, 10)
    quantity = 0;
    @EmailAddress({ messageKey: "Order.EmailAddress" })
    email = "";
    @Required({ message: "Quantity is mandatory." })
    count = null;
  }

  it("the reserved tsazor.validation.<kind> keys localize with {displayName} and the rule params", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const culture = new CultureService("de-DE");
    const localizer = new StringLocalizer({ culture, tables: TABLES, defaultCulture: "en-US" });
    const context = new EditContext(new Order());
    const subscription = enableDataAnnotationsValidation(context, { localizer });
    expect(context.validate()).toBe(false);
    expect(context.getValidationMessages()).toEqual([
      "Das Feld 'title' ist ein Pflichtfeld.",
      "Das Feld quantity muss zwischen 1 und 10 liegen.",
      "Das Feld 'email' ist keine gültige E-Mail-Adresse.",
      "Quantity is mandatory.", // a fixed message override ignores the culture
    ]);
    warn.mockRestore();
    subscription();
    localizer.dispose();
  });

  it("a culture change re-localizes exactly the fields that hold messages (the store notifies → the form re-renders)", () => {
    const culture = new CultureService("de-DE");
    const localizer = new StringLocalizer({ culture, tables: TABLES, defaultCulture: "en-US" });
    const context = new EditContext(new Order());
    const subscription = enableDataAnnotationsValidation(context, { localizer });
    context.validate();
    expect(context.getValidationMessages("title")).toEqual(["Das Feld 'title' ist ein Pflichtfeld."]);
    culture.setExplicit("en-US");
    expect(context.getValidationMessages()).toEqual([
      "The field 'title' is required.",
      "The field quantity must be between 1 and 10.",
      "The field 'email' is not a valid e-mail address.",
      "Quantity is mandatory.",
    ]);
    subscription();
    localizer.dispose();
  });

  it("an untouched model gains no messages from a culture change (fieldsWithMessages scoping)", () => {
    const culture = new CultureService("de-DE");
    const localizer = new StringLocalizer({ culture, tables: TABLES, defaultCulture: "en-US" });
    const context = new EditContext(new Order());
    const subscription = enableDataAnnotationsValidation(context, { localizer });
    culture.setExplicit("en-US"); // never validated → nothing to re-localize
    expect(context.getValidationMessages()).toEqual([]);
    subscription();
    localizer.dispose();
  });

  it("a messageFactory wins over the localizer and the built-in text", () => {
    class Note {
      @MinLength(3, { messageFactory: (ctx) => `${ctx.displayName} braucht mindestens ${ctx.min} Zeichen.` })
      text = "ab";
    }
    const context = new EditContext(new Note());
    const subscription = enableDataAnnotationsValidation(context);
    expect(context.validate()).toBe(false);
    expect(context.getValidationMessages()).toEqual(["text braucht mindestens 3 Zeichen."]);
    subscription();
  });
});

describe("formatValue/parseValue with a culture (E8 §5)", () => {
  it("a culture routes numbers through Intl; the invariant path is unchanged", () => {
    expect(formatValue(1234.5, undefined, "de-DE")).toBe("1.234,5");
    expect(formatValue(1234.5, undefined, "en-US")).toBe("1,234.5");
    expect(formatValue(1234.5, "N2", "de-DE")).toBe("1.234,50");
    // A "0.00" mask carries no comma → no grouping, like the invariant path.
    expect(formatValue(1234.5, "0.00", "de-DE")).toBe("1234,50");
    expect(formatValue(-1234.5, undefined, "de-DE")).toBe("-1.234,5");
    expect(formatValue(null, "N2", "de-DE")).toBe("");
    // Invariant (A5/B7): no culture, no Intl.
    expect(formatValue(1234.5, undefined)).toBe("1234.5");
    expect(formatValue(1234.5, "N2")).toBe("1,234.50");
  });

  it("parsing follows the culture's grammar — invariant text is rejected in de-DE, like .NET's TryParse", () => {
    expect(parseValue("1.234,5", undefined, "de-DE")).toBe(1234.5);
    expect(parseValue("-1.234,5", undefined, "de-DE")).toBe(-1234.5);
    expect(parseValue("1.234,50", "N2", "de-DE")).toBe(1234.5);
    expect(parseValue("1,234.5", undefined, "en-US")).toBe(1234.5);
    expect(parseValue("", undefined, "de-DE")).toBeNull();
    expect(parseValue("garbage", undefined, "de-DE")).toBeNull();
    // The invariant "1,234.5" is not de-DE grammar (", " is not its group separator).
    expect(parseValue("1,234.5", undefined, "de-DE")).toBeNull();
    // Invariant (A5/B7): no culture, no Intl.
    expect(parseValue("1,234.5", "N2")).toBe(1234.5);
  });

  it("dates keep the ISO contract — a culture on the date path is inert", () => {
    const date = new Date(2024, 0, 5);
    expect(formatValue(date, undefined, "de-DE")).toBe("2024-01-05");
    expect(parseValue("2024-01-05", "yyyy-MM-dd", "de-DE")).toEqual(new Date(2024, 0, 5));
  });
});

describe("@bind:culture through the compiler (E8 §5, end to end)", () => {
  it("a number input renders in the culture and parses the change value in its grammar", async () => {
    const m = await mount(`@import { CultureInfo } from "@tsazor/runtime"
<input type="number" @bind="amount" @bind:culture="de" /><p>@amount</p>
@code { private de = new CultureInfo("de-DE"); private amount = 1234.5; }`);
    const input = m.container.querySelector("input")!;
    expect(input.value).toBe("1.234,5");
    input.value = "7.250,25";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await m.settle();
    expect(m.instance.amount).toBe(7250.25);
    expect(m.container.querySelector("p")!.textContent).toBe("7250.25");
    expect(input.value).toBe("7.250,25");
  });

  it("invariant text in a culture bind keeps the model's previous value (TryParse false)", async () => {
    const m = await mount(`@import { CultureInfo } from "@tsazor/runtime"
<input type="number" @bind="amount" @bind:culture="de" />
@code { private de = new CultureInfo("de-DE"); private amount = 1234.5; }`);
    const input = m.container.querySelector("input")!;
    input.value = "1,234.5";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await m.settle();
    expect(m.instance.amount).toBe(1234.5);
  });

  it("culture and format combine (N2 digits on the culture's separators)", async () => {
    const m = await mount(`@import { CultureInfo } from "@tsazor/runtime"
<input type="number" @bind="amount" @bind:format="N2" @bind:culture="de" />
@code { private de = new CultureInfo("de-DE"); private amount = 1234.5; }`);
    const input = m.container.querySelector("input")!;
    expect(input.value).toBe("1.234,50");
    input.value = "7.250,25";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await m.settle();
    expect(m.instance.amount).toBe(7250.25);
  });

  it("en-US groups with commas and parses them back; a bind without a culture stays exactly as before (A5/B7)", async () => {
    const m = await mount(`@import { CultureInfo } from "@tsazor/runtime"
<input type="number" @bind="amount" @bind:culture="us" />
@code { private us = new CultureInfo("en-US"); private amount = 1234.5; }`);
    const input = m.container.querySelector("input")!;
    expect(input.value).toBe("1,234.5");
    input.value = "9,999.75";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await m.settle();
    expect(m.instance.amount).toBe(9999.75);

    const plain = await mount(`<input type="number" @bind="amount" />
@code { private amount = 1234.5; }`);
    expect(plain.container.querySelector("input")!.value).toBe("1234.5");
  });

  it("a culture on a date bind warns TZS008 and stays inert (the input's value is ISO)", async () => {
    const diagnostics = await diagnosticsOf(`@import { CultureInfo } from "@tsazor/runtime"
<input type="date" @bind="day" @bind:culture="de" />
@code { private de = new CultureInfo("de-DE"); private day = new Date(); }`);
    expect(errorCodes(diagnostics)).toEqual([]);
    expect(diagnostics.some((d) => d.code === "TZS008" && d.severity === "warning" && d.message.includes("number values only"))).toBe(true);
  });
});