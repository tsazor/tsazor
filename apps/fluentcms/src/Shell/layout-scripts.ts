import type { LayoutScript } from "./layout-markup";

/**
 * A stored layout's scripts. Markup never runs a script, and FluentCMS's layouts bring theirs (`app.js`
 * binds the theme toggle and the mobile menu).
 *
 * The original runs them on a full page load and then raises `fluentcms:init`. After each enhanced
 * navigation it raises `fluentcms:afterenhanced`, and the scripts bind again. An SPA navigates without
 * loading a page, so: each script runs once per document, in the layout's order; then the event.
 */
const ran = new Set<string>();
let initialized = false;

/** Runs the scripts that haven't run yet (in order), then raises FluentCMS's page event. */
export async function runLayoutScripts(scripts: readonly LayoutScript[]): Promise<void> {
    for (const script of scripts) {
        const key = script.attributes.find(([name]) => name.toLowerCase() === "src")?.[1] ?? script.text;
        if (ran.has(key)) continue;
        ran.add(key);
        await run(script);
    }
    document.dispatchEvent(new CustomEvent(initialized ? "fluentcms:afterenhanced" : "fluentcms:init", { bubbles: true }));
    initialized = true;
}

/** A script element made by the DOM runs when it is inserted (one parsed from markup doesn't). */
function run(script: LayoutScript): Promise<void> {
    const element = document.createElement("script");
    for (const [name, value] of script.attributes) element.setAttribute(name, value);
    element.text = script.text;
    const done = element.src === "" ? Promise.resolve() : new Promise<void>((resolve) => {
        element.onload = element.onerror = () => resolve();
    });
    document.body.append(element);
    return done;
}
