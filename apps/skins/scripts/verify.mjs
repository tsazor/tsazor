/**
 * The skins gate: the same pages built with @tsazor/bootstrap and with
 * @tsazor/fluent, each served on its own port, and the same checks run on both —
 * axe (WCAG 2.2 AA) on every page and the behaviors, found by role, label and
 * text (no skin classes), so both skins must behave alike.
 *
 *   node scripts/verify.mjs   (builds both into dist/ first)
 */
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as playwright from "playwright-core";
import { launchBrowser } from "../../../scripts/browsers.mjs";
import { streamEvents } from "./events-endpoint.mjs";
import { receiveUpload } from "./upload-endpoint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SKINS = { bootstrap: 5397, fluent: 5398 };
const ROUTES = ["/", "/actions", "/forms", "/data", "/overlays", "/structure", "/content", "/icons", "/charts"];
const url = (skin) => `http://localhost:${SKINS[skin]}`;

for (const [skin, other] of [["bootstrap", "fluent"], ["fluent", "bootstrap"]]) {
  const build = spawnSync("npx", ["vite", "build", "--mode", skin, "--outDir", `dist/${skin}`, "--logLevel", "warn"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, OTHER_SKIN_URL: url(other) },
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml" };
const servers = Object.entries(SKINS).map(([skin, port]) => {
  const dist = path.join(ROOT, "dist", skin);
  return http
    .createServer((request, response) => {
      if (receiveUpload(request, response) || streamEvents(request, response)) return;
      const requestUrl = new URL(request.url ?? "/", url(skin));
      let file = path.join(dist, decodeURIComponent(requestUrl.pathname));
      if (!file.startsWith(dist) || !existsSync(file) || !path.extname(file)) file = path.join(dist, "index.html");
      response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      response.end(readFileSync(file));
    })
    .listen(port);
});

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};

async function axe(page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]),
  );
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
    return result.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}×) ${v.nodes[0]?.target.join(" ")} — ${(v.nodes[0]?.any[0] ?? v.nodes[0]?.all[0])?.message ?? ""}`);
  }, WCAG_TAGS);
}

async function open(page, base, route) {
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  // A page that failed to load is empty, and axe finds nothing wrong with nothing.
  await page.waitForSelector("h1", { timeout: 15_000 });
}

const browser = await launchBrowser(playwright);
try {
  for (const skin of Object.keys(SKINS)) {
    const base = url(skin);
    const other = skin === "fluent" ? "bootstrap" : "fluent";
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const say = (ok, label) => check(ok, `[${skin}] ${label}`);
    const focusedText = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");

    for (const route of ROUTES) {
      await open(page, base, route);
      const violations = await axe(page);
      say(violations.length === 0, `axe ${route}${violations.length ? `: ${violations.join(" | ")}` : ""}`);
    }

    /* The skin: its stylesheet is loaded, and the switch leads to the same page in the other build. */
    await open(page, base, "/data");
    say((await page.getAttribute("html", "data-skin")) === skin, "the build renders with its skin");
    const switchHref = await page.getByRole("link", { name: /Show this page with/ }).getAttribute("href");
    say(switchHref === `${url(other)}/data`, `the skin switch leads to the same page in the other build (${switchHref})`);

    /* Actions: button, menu, popover, tooltip. */
    await open(page, base, "/actions");
    await page.getByRole("button", { name: "Primary" }).click();
    await page.waitForFunction(() => document.querySelector(".clicks")?.textContent === "1");
    say(true, "a button raises onClick");
    await page.getByRole("button", { name: "Order actions" }).focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForSelector("[role=menu]");
    say((await focusedText()) === "Copy", "menu: ArrowDown opens it on the first item");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.waitForSelector("[role=menu]", { state: "detached" });
    say((await page.textContent(".menu-choice")) === "Chose Archive.", "menu: End and Enter choose the last item");
    say(await page.getByRole("button", { name: "Order actions" }).evaluate((el) => el === document.activeElement), "menu: focus returns to the toggle");
    const opener = page.getByRole("button", { name: "Opening hours" });
    await opener.click();
    await page.waitForSelector("[role=dialog]");
    say(await page.evaluate(() => document.activeElement?.getAttribute("role") === "dialog"), "popover: focus moves into it");
    await page.keyboard.press("Escape");
    await page.waitForSelector("[role=dialog]", { state: "detached" });
    say(await opener.evaluate((el) => el === document.activeElement), "popover: Escape returns focus to its button");
    await page.getByRole("button", { name: "Print", exact: true }).focus();
    await page.waitForSelector("[role=tooltip]");
    say((await page.getByRole("button", { name: "Print", exact: true }).getAttribute("aria-describedby")) !== null, "tooltip: describes its button");

    /* Toolbar: one tab stop, the arrow keys move and wrap, Home and End; a text field keeps its arrows; a menu its own. */
    const toolbar = page.getByRole("toolbar", { name: "Order list" });
    const focusedName = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim());
    await toolbar.scrollIntoViewIfNeeded();
    const tabStops = await toolbar.evaluate((bar) => [...bar.querySelectorAll("[tabindex='0']")].length);
    say(tabStops === 1, `toolbar: one tab stop (${tabStops})`);
    await toolbar.getByRole("button", { name: "New order" }).focus();
    await page.keyboard.press("ArrowRight");
    say((await focusedName()) === "Save the list", "toolbar: ArrowRight moves to the next control");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    say((await focusedName()) === "Find an order", "toolbar: ArrowLeft wraps to the last control");
    await page.keyboard.type("42");
    await page.keyboard.press("ArrowLeft");
    say((await focusedName()) === "Find an order", "toolbar: in the search field ArrowLeft edits the text");
    await page.keyboard.press("Home");
    say((await focusedName()) === "Find an order", "toolbar: in the search field Home stays in the text");
    await page.keyboard.press("Shift+Tab");
    say(!(await toolbar.evaluate((bar) => bar.contains(document.activeElement))), "toolbar: Shift+Tab leaves it at once");
    await page.keyboard.press("Tab");
    say((await focusedName()) === "Find an order", "toolbar: Tab comes back to the last focused control");
    await toolbar.getByRole("button", { name: "Compact" }).focus();
    await page.keyboard.press("End");
    say((await focusedName()) === "Find an order", "toolbar: End jumps to the last control");
    await toolbar.getByRole("button", { name: "Roomy" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector(".toolbar-density")?.textContent === "roomy");
    say((await toolbar.getByRole("button", { name: "Roomy" }).getAttribute("aria-pressed")) === "true", "toolbar: a toggle button says it is pressed");
    await page.keyboard.press("ArrowRight");
    say((await focusedName()) === "Export", "toolbar: the arrow keys reach a menu's toggle");
    await page.keyboard.press("ArrowDown");
    await page.waitForSelector("[role=menu]");
    await page.keyboard.press("ArrowDown");
    say((await focusedText()) === "As PDF", "toolbar: in its open menu the arrow keys move the menu's items");
    await page.keyboard.press("Enter");
    await page.waitForSelector("[role=menu]", { state: "detached" });
    say((await page.textContent(".toolbar-choice")) === "Used Export as PDF.", "toolbar: a menu item in it chooses");

    /* Forms: messages only after a submit, linked to their inputs. */
    await open(page, base, "/forms");
    await page.getByRole("button", { name: "Reserve" }).click();
    await page.waitForFunction(() => document.body.textContent?.includes("Enter a name."));
    const name = page.getByLabel("Name", { exact: true });
    say((await name.getAttribute("aria-invalid")) === "true", "form: an invalid field says so (aria-invalid)");
    const describedBy = (await name.getAttribute("aria-describedby")) ?? "";
    const description = await page.evaluate((ids) => ids.split(" ").map((id) => document.getElementById(id)?.textContent?.trim()).join(" | "), describedBy);
    say(description.includes("As it should appear on the order.") && description.includes("Enter a name."), `form: help and message describe the field (${description})`);
    const formViolations = await axe(page);
    say(formViolations.length === 0, `axe /forms with the messages${formViolations.length ? `: ${formViolations.join(" | ")}` : ""}`);
    await name.fill("Marta");
    await name.dispatchEvent("change");
    await page.getByLabel("Bread").selectOption("rye");
    await page.getByLabel("I accept the terms").check();
    await page.getByRole("button", { name: "Reserve" }).click();
    await page.waitForFunction(() => document.querySelector(".order-status")?.textContent?.startsWith("Reserved: 1 × rye for Marta"));
    say(true, "form: fixed and submitted, OnValidSubmit runs");

    /* Forms: a wizard whose first step is a form. */
    await open(page, base, "/forms");
    const wizard = page.locator(".order-wizard");
    const currentStep = () => wizard.locator("[aria-current=step]").innerText();
    await wizard.getByRole("button", { name: "Next" }).click();
    await page.getByText("Whom is the bread for?").waitFor({ timeout: 5000 });
    say((await currentStep()).includes("Customer"), "wizard: Next keeps an invalid step's form and shows its message");
    await wizard.getByLabel("Name on the order").fill("Marta");
    await wizard.getByLabel("Name on the order").blur();
    await wizard.getByRole("button", { name: "Next" }).click();
    await page.waitForFunction(() => document.querySelector(".order-wizard [aria-current=step]")?.textContent?.includes("Pickup"));
    await wizard.getByRole("button", { name: "Next" }).click();
    await page.waitForFunction(() => document.querySelector(".order-wizard [aria-current=step]")?.textContent?.includes("Confirm"));
    await wizard.getByRole("button", { name: "Done" }).click();
    await page.waitForFunction(() => document.querySelector(".wizard-status")?.textContent === "Ordered for Marta.");
    say(true, "wizard: a valid form moves on, the steps follow, Done finishes");
    const wizardViolations = await axe(page);
    say(wizardViolations.length === 0, `axe /forms at the wizard's last step${wizardViolations.length ? `: ${wizardViolations.join(" | ")}` : ""}`);

    /* Slider: the keys, the marks where the thumb goes, the value as text, an update on release only, vertical. */
    const sliders = page.locator("section", { has: page.getByRole("heading", { name: "Slider", exact: true }) });
    const caption = (name) => page.locator(`.slider-${name}`).textContent();
    const captionIs = (name, value) => page.waitForFunction(([n, v]) => document.querySelector(`.slider-${n}`)?.textContent === v, [name, value]);
    const crust = sliders.getByRole("slider", { name: "Crust" });
    // (instant: Bootstrap's reboot scrolls smoothly, and the boxes would move under the clicks.)
    await sliders.evaluate((section) => section.scrollIntoView({ block: "center", behavior: "instant" }));
    await crust.focus();
    await page.keyboard.press("ArrowRight");
    await captionIs("crust", "75");
    say(true, "slider: ArrowRight moves a step (two-way bound)");
    await page.keyboard.press("Home");
    await captionIs("crust", "0");
    await page.keyboard.press("End");
    await captionIs("crust", "100");
    say(true, "slider: Home and End go to min and max");
    const crustBox = await crust.boundingBox();
    for (const [label, value] of [["Light", "25"], ["Golden", "50"], ["Dark", "75"]]) {
      const box = await sliders.getByText(label, { exact: true }).boundingBox();
      await page.mouse.click(box.x + box.width / 2, crustBox.y + crustBox.height / 2);
      await captionIs("crust", value);
    }
    say(true, "slider: a click above a mark's label gives the mark's value");
    const sweetness = sliders.getByRole("slider", { name: "Sweetness" });
    const marks = sweetness.locator("xpath=following-sibling::*[@aria-hidden='true']/*");
    say((await marks.count()) === 11, `slider: a mark per step (${await marks.count()})`);
    const sweetBox = await sweetness.boundingBox();
    const missed = [];
    for (const step of [0, 3, 7, 10]) {
      const mark = await marks.nth(step).boundingBox();
      await page.mouse.click(sweetBox.x + sweetBox.width / 2, mark.y + mark.height / 2);
      await page.waitForTimeout(100);
      if ((await caption("sweetness")) !== String(step)) missed.push(`${step} → ${await caption("sweetness")}`);
    }
    say(missed.length === 0, `slider: the marks sit where the thumb goes for their value, a step apart${missed.length ? ` (${missed.join(", ")})` : ""}`);
    say(sweetBox.height > sweetBox.width * 3 && (await sweetness.getAttribute("aria-orientation")) === "vertical", `slider: vertical stands up (${Math.round(sweetBox.width)}×${Math.round(sweetBox.height)})`);
    await sweetness.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowUp");
    await captionIs("sweetness", "1");
    say(true, "slider: ArrowUp raises a vertical slider");
    const oven = sliders.getByRole("slider", { name: "Oven" });
    say((await oven.getAttribute("aria-valuetext")) === "220 °C", "slider: screen readers read the value's format (aria-valuetext)");
    await oven.focus();
    await page.keyboard.press("ArrowRight");
    await captionIs("oven", "225");
    say((await oven.getAttribute("aria-valuetext")) === "225 °C" && (await sliders.getByText("225 °C").isVisible()), "slider: the value label follows");
    const rise = sliders.getByRole("slider", { name: "Rise" });
    const riseBox = await rise.boundingBox();
    // (A press on the track takes the thumb there and drags it.)
    const riseAt = (fraction) => riseBox.x + riseBox.width * fraction;
    await page.mouse.move(riseAt(0.3), riseBox.y + riseBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(riseAt(0.6), riseBox.y + riseBox.height / 2, { steps: 6 });
    const moving = await rise.inputValue();
    const shown = await rise.locator("xpath=../following-sibling::output").textContent();
    const heldBack = (await caption("rise")) === "30" && moving !== "30" && shown === moving;
    await page.mouse.up();
    await captionIs("rise", moving);
    say(heldBack, `slider: immediate false shows the drag (${shown}) and updates the value on release`);
    const sliderViolations = await axe(page);
    say(sliderViolations.length === 0, `axe /forms with the sliders${sliderViolations.length ? `: ${sliderViolations.join(" | ")}` : ""}`);

    /* Date picker: the locale's text, the calendar in a dialog with its keys, ruled-out days, typing, a month; a range. */
    const dates = page.locator("section", { has: page.getByRole("heading", { name: "Date picker and calendar", exact: true }) });
    await dates.evaluate((section) => section.scrollIntoView({ block: "start", behavior: "instant" }));
    const dateIs = (name, value) => page.waitForFunction(([n, v]) => document.querySelector(`.date-${n}`)?.textContent === v, [name, value]);
    const focusedLabel = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    const pickup = dates.getByLabel("Pickup day");
    const pickupButton = pickup.locator("xpath=following-sibling::button");
    say((await pickup.inputValue()) === "10/10/2026", "date picker: the value as the locale writes it (10/10/2026)");
    await pickupButton.click();
    const calendarDialog = page.getByRole("dialog", { name: "Choose date" });
    await calendarDialog.waitFor();
    say((await focusedLabel()) === "Saturday, October 10, 2026", `date picker: the calendar opens on the value (${await focusedLabel()})`);
    const [fieldBox, dialogBox] = [await pickup.boundingBox(), await calendarDialog.boundingBox()];
    say(dialogBox.y >= fieldBox.y + fieldBox.height - 1, "date picker: the calendar opens below the field");
    const calendarViolations = await axe(page);
    say(calendarViolations.length === 0, `axe /forms with the calendar open${calendarViolations.length ? `: ${calendarViolations.join(" | ")}` : ""}`);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    say((await calendarDialog.isVisible()) && (await page.locator(".date-pickup").textContent()) === "2026-10-10", "date picker: a ruled-out day (a Sunday) can't be picked");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await dateIs("pickup", "2026-10-12");
    await calendarDialog.waitFor({ state: "detached" });
    say(await pickupButton.evaluate((button) => button === document.activeElement), "date picker: Enter picks the day and closes the calendar, the focus back on the button");
    await pickupButton.click();
    await calendarDialog.waitFor();
    await page.keyboard.press("PageDown");
    await calendarDialog.getByText("November 2026").waitFor();
    say((await focusedLabel()) === "Thursday, November 12, 2026", "date picker: Page Down shows the next month");
    await page.keyboard.press("Escape");
    await calendarDialog.waitFor({ state: "detached" });
    say(await pickupButton.evaluate((button) => button === document.activeElement), "date picker: Escape closes it, the focus back on the button");
    await pickup.fill("11/3/2026");
    await pickup.press("Tab");
    await dateIs("pickup", "2026-11-03");
    say((await pickup.inputValue()) === "11/03/2026", "date picker: typed text in the locale's order");
    const delivery = dates.getByLabel("Liefertag");
    say((await delivery.inputValue()) === "10.10.2026", "date picker: in German 10.10.2026");
    await delivery.fill("24.12.2026");
    await delivery.press("Tab");
    await dateIs("delivery", "2026-12-24");
    await delivery.locator("xpath=following-sibling::button").click();
    const germanDialog = page.getByRole("dialog", { name: "Datum wählen" });
    await germanDialog.waitFor();
    say((await germanDialog.locator("th").first().textContent()).trim() === "Mo" && (await germanDialog.getByText("Dezember 2026").isVisible()), "date picker: the German calendar starts on Monday");
    await page.keyboard.press("Escape");
    await germanDialog.waitFor({ state: "detached" });
    const billing = dates.getByLabel("Billing month");
    await billing.locator("xpath=following-sibling::button").click();
    await calendarDialog.getByRole("gridcell", { name: "March 2026" }).click();
    await dateIs("billing", "2026-03-01");
    say((await billing.inputValue()) === "March 2026", "date picker: view months picks a month");
    const holidays = dates.getByRole("group", { name: "Holidays" });
    await holidays.getByRole("gridcell", { name: "Monday, December 21, 2026" }).click();
    await holidays.getByRole("gridcell", { name: "Wednesday, December 23, 2026" }).click();
    await dateIs("holidays", "2026-12-21, 2026-12-22, 2026-12-23");
    say(true, "calendar: two clicks pick a range");
    await holidays.getByRole("button", { name: "December 2026" }).click();
    say(await holidays.getByRole("gridcell", { name: "December 2026" }).isVisible(), "calendar: the title zooms out to the months");

    /* File upload: chosen and dropped files go to the server with the progress; the size limit; a button elsewhere. */
    const uploads = page.locator("section", { has: page.getByRole("heading", { name: "File upload", exact: true }) });
    await uploads.evaluate((section) => section.scrollIntoView({ block: "start", behavior: "instant" }));
    const chooser = uploads.getByLabel(/Drop price lists here/);
    const prices = "bread;3.20\nrolls;0.60\n";
    await chooser.setInputFiles([
      { name: "prices.csv", mimeType: "text/csv", buffer: Buffer.from(prices) },
      { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.alloc(40 * 1024, 65) },
    ]);
    await uploads.getByText("notes.txt: 40 kB sent").waitFor();
    say(await uploads.getByText(`prices.csv: ${prices.length} byte sent`).isVisible(), "file upload: chosen files go to the server, one by one");
    const uploadBar = uploads.getByRole("progressbar").first();
    say((await uploadBar.getAttribute("aria-valuenow")) === "100" && (await uploads.getByRole("status").first().textContent()) === "Completed", "file upload: the progress reaches 100, Completed");
    await uploads.locator("label").first().evaluate((zone) => {
      const data = new DataTransfer();
      data.items.add(new File(["x".repeat(10)], "dropped.csv", { type: "text/csv" }));
      zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
    });
    await uploads.getByText("dropped.csv: 10 byte sent").waitFor();
    say(true, "file upload: dropped files go to the server");
    await chooser.setInputFiles({ name: "huge.csv", mimeType: "text/csv", buffer: Buffer.alloc(2 * 1024 * 1024) });
    await uploads.getByText("huge.csv: The maximum size allowed is reached").waitFor();
    say(true, "file upload: a file over the limit is refused");
    const [listChooser] = await Promise.all([page.waitForEvent("filechooser"), uploads.getByRole("button", { name: "Read a delivery list" }).click()]);
    await listChooser.setFiles({ name: "route.csv", mimeType: "text/csv", buffer: Buffer.from("Mill Lane 4\nStation Road 12\nHigh Street 1\n") });
    await page.waitForFunction(() => document.querySelector(".delivery-list")?.textContent === "Read 3 lines from route.csv.");
    say(true, "file upload: a button elsewhere opens the chooser; buffer mode reads the file");
    const uploadViolations = await axe(page);
    say(uploadViolations.length === 0, `axe /forms after the uploads${uploadViolations.length ? `: ${uploadViolations.join(" | ")}` : ""}`);

    /* Choices: a checkbox group binds an array in the options' order; an autocomplete searches and picks chips. */
    const choices = page.locator("section", { has: page.getByRole("heading", { name: "Choices", exact: true }) });
    await choices.evaluate((section) => section.scrollIntoView({ block: "start", behavior: "instant" }));
    const choiceIs = (name, value) => page.waitForFunction(([n, v]) => document.querySelector(`.choice-${n}`)?.textContent === v, [name, value]);
    await choices.getByLabel("Gluten").check();
    await choiceIs("allergens", "gluten, nuts");
    say(true, "checkbox group: a checked option joins the bound array, in the options' order");
    const toppings = choices.getByRole("combobox", { name: "Toppings" });
    await toppings.fill("pump");
    const toppingList = page.getByRole("listbox", { name: "Toppings" });
    await toppingList.waitFor();
    say((await toppingList.getByRole("option").allTextContents()).map((text) => text.trim()).join(", ") === "Pumpkin seeds", "autocomplete: typing filters the options");
    await toppings.press("ArrowDown");
    await toppings.press("Enter");
    await choiceIs("toppings", "Pumpkin seeds");
    say(await choices.getByRole("button", { name: "Remove Pumpkin seeds" }).isVisible(), "autocomplete: Enter picks the option as a removable chip");
    await choices.getByRole("button", { name: "Remove Pumpkin seeds" }).click();
    await choiceIs("toppings", "");
    say(true, "autocomplete: a chip's button removes it");
    const choiceViolations = await axe(page);
    say(choiceViolations.length === 0, `axe /forms with the choices${choiceViolations.length ? `: ${choiceViolations.join(" | ")}` : ""}`);

    /* Data: the grid sorts, pages and selects. */
    await open(page, base, "/data");
    const grid = page.getByRole("table", { name: "Orders" });
    say((await grid.locator("th[aria-sort=ascending]").textContent())?.includes("Customer") === true, "grid: sorted by its default column (aria-sort)");
    await grid.getByRole("button", { name: /Total/ }).click();
    await page.waitForFunction(() => document.querySelector("table[aria-label=Orders] th[aria-sort]")?.textContent?.includes("Total"));
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForFunction(() => document.querySelector("table[aria-label=Orders]")?.textContent !== null);
    await grid.getByRole("checkbox", { name: "Select row 11" }).check();
    await page.waitForFunction(() => document.querySelector(".grid-selection")?.textContent === "1 selected");
    say(true, "grid: sorts on a header, pages, and selects a row");

    /* Overlays: dialog, drawer, toasts. */
    await open(page, base, "/overlays");
    await page.getByRole("button", { name: "Delete order" }).click();
    await page.waitForSelector("[role=dialog]");
    say(await page.evaluate(() => document.querySelector("[role=dialog]")?.contains(document.activeElement) ?? false), "dialog: focus moves in");
    const dialogViolations = await axe(page);
    say(dialogViolations.length === 0, `axe /overlays with the dialog open${dialogViolations.length ? `: ${dialogViolations.join(" | ")}` : ""}`);
    await page.keyboard.press("Escape");
    await page.waitForSelector("[role=dialog]", { state: "detached" });
    say((await focusedText()) === "Delete order", "dialog: Escape closes it and focus returns");
    await page.getByRole("button", { name: "Filters" }).click();
    await page.waitForSelector("[role=dialog]");
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForFunction(() => document.querySelector(".overlay-result")?.textContent === "Showing all orders.");
    say(true, "drawer: a button in it applies and closes it");
    await page.getByRole("button", { name: "Error toast" }).click();
    await page.waitForSelector("[role=alert]");
    say((await page.locator("[role=alert]").textContent())?.includes("Upload failed.") === true, "toast: a danger toast is an alert");

    /* Icons: on the components, and the Icons page browses the skin's set. */
    await open(page, base, "/actions");
    const iconPaths = await page.locator(".icons-demo").evaluate((row) => row.querySelectorAll("svg path").length);
    say(iconPaths >= 4, `icons: Save, More, Delete and the badge draw the skin's icons (${iconPaths} paths)`);
    say((await page.getByRole("button", { name: "Delete" }).locator("svg").count()) === 1, "icons: an icon-only button is named by its ariaLabel");
    await open(page, base, "/icons");
    await page.waitForSelector(".icons-cell", { timeout: 30_000 });
    const total = Number((await page.locator(".icons-count").textContent())?.split(" ")[0]);
    say(total > 2000, `icons page: the whole set (${total} icons)`);
    say((await page.locator(".icons-cell").count()) < 300, "icons page: Virtualize renders only the rows in view");
    await page.getByLabel("Search").fill("arrow left");
    await page.waitForFunction((all) => Number(document.querySelector(".icons-count")?.textContent?.split(" ")[0]) < all, total);
    const names = await page.locator(".icons-name").allTextContents();
    say(names.length > 0 && names.every((name) => /arrow/i.test(name) && /left/i.test(name)), `icons page: the search filters as you type (${names.slice(0, 3).join(", ")})`);
    if (skin === "fluent") {
      await page.getByLabel("Search").fill("");
      await page.getByLabel("Variant").selectOption("Light");
      await page.waitForFunction(() => document.querySelector(".icons-cell")?.getAttribute("title")?.startsWith("Icons.Light.Size24.") ?? false);
      say(true, "icons page: another variant loads its own module, at a size it has (Light starts at 24)");
    }
    await page.locator(".icons-cell").first().click();
    await page.waitForFunction(() => document.body.textContent?.includes('<Icon Value="@Icons.') ?? false);
    say(true, "icons page: a click gives the icon's markup");

    /* Content: avatars. */
    await open(page, base, "/content");
    const avatars = page.locator(".avatars [role=img]");
    say((await avatars.first().textContent()) === "AL" && (await avatars.first().getAttribute("aria-label")) === "Ada Lovelace", "avatar: the name's initials, named by it");
    const backgrounds = await avatars.evaluateAll((items) => items.slice(0, 5).map((item) => getComputedStyle(item).backgroundColor));
    say(new Set(backgrounds).size > 2, `avatar: colorful gives the names different colors (${new Set(backgrounds).size})`);
    say((await page.locator(".avatars [aria-hidden=true] svg").count()) === 1, "avatar: without a name, a decorative person icon");
    await page.getByRole("button", { name: "Marta Bauer" }).press("Enter");
    await page.waitForFunction(() => document.querySelector(".picked")?.textContent === "Picked Marta Bauer.");
    say(true, "avatar: with onClick it is a button that Enter clicks");

    /* Content: chips. */
    const breads = page.getByRole("group", { name: "Breads" });
    await breads.getByRole("button", { name: "Spelt" }).click();
    await page.waitForFunction(() => document.querySelector(".chip-choice")?.textContent === "Chosen: Rye, Spelt.");
    say((await breads.getByRole("button", { name: "Spelt" }).getAttribute("aria-pressed")) === "true", "chips: a click selects a chip (aria-pressed), two-way bound");
    const tags = page.getByRole("group", { name: "Tags" });
    await tags.getByRole("button", { name: "Remove gluten-free" }).focus();
    await page.keyboard.press("Delete");
    await page.waitForFunction(() => !document.querySelector(".tag-set")?.textContent?.includes("gluten-free"));
    say((await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Remove pickup", "chips: Delete closes a chip and the focus moves to the next");

    /* Content: timelines, as laid out in the browser. */
    const history = page.getByRole("list", { name: "Order history" });
    const dotLefts = await history.locator("li [aria-hidden=true]").evaluateAll((dots) => dots.map((dot) => Math.round(dot.getBoundingClientRect().left)));
    say(dotLefts.length === 3 && new Set(dotLefts).size === 1, `timeline: the dots line up, whatever the opposite content's width (${dotLefts.join(", ")})`);
    const sides = await page.getByRole("list", { name: "Week" }).locator("li").evaluateAll((items) => items.map((li) => {
      const dot = li.querySelector("[aria-hidden=true]").getBoundingClientRect();
      const content = [...li.children].at(-1).getBoundingClientRect();
      return content.left > dot.left ? "after" : "before";
    }));
    say(sides.join(" ") === "after before after", `timeline: alternate puts the content on both sides in turn (${sides.join(" ")})`);

    /* Content: Markdown, rendered and sanitized in a real browser (unit tests can't: DOMPurify needs a real DOM). */
    const preview = page.locator(".markdown-preview .tz-markdown");
    say((await preview.locator("h2").textContent()) === "Order 1042", "markdown: the text renders as HTML");
    say((await preview.locator("input[type=checkbox]").count()) === 2 && (await preview.locator("td").count()) === 4, "markdown: task lists and tables (GitHub Flavored Markdown)");
    const external = preview.getByRole("link", { name: "the hours" });
    say((await external.getAttribute("target")) === "_blank" && (await external.getAttribute("rel")) === "noopener noreferrer", "markdown: a link to another origin opens in a new tab, without access to the page");
    await page.getByLabel("Text").fill("# Live\n\nTyped *now*");
    await page.waitForFunction(() => document.querySelector(".markdown-preview h1")?.textContent === "Live");
    say(true, "markdown: the preview follows the typing (TextArea immediate)");
    const untrusted = page.locator(".markdown-untrusted .tz-markdown");
    // The image is missing: an onerror that survived would have run by now.
    await page.waitForFunction(() => document.querySelector(".markdown-untrusted img")?.complete === true);
    say((await page.evaluate(() => window.__xss)) === undefined, "markdown: nothing in an untrusted text ran (script, onerror)");
    say((await untrusted.locator("script, [onerror], [style], a[href^='javascript:']").count()) === 0 && (await untrusted.locator("img[alt=chart]").count()) === 1,
      "markdown: the sanitizer removed what could run and kept the rest");
    await untrusted.getByText("Open the report").click();
    say((await page.evaluate(() => window.__xss)) === undefined, "markdown: the javascript: link lost its href, so a click runs nothing");
    say((await untrusted.getByRole("link", { name: "Orders" }).getAttribute("target")) === null, "markdown: a link in the app stays in the app");

    /* Structure: tabs, accordion, pagination. */
    await open(page, base, "/structure");
    await page.getByRole("tab", { name: "Items" }).focus();
    await page.keyboard.press("ArrowRight");
    say((await page.getByRole("tabpanel").textContent())?.includes("Tomorrow") === true, "tabs: ArrowRight shows the next panel");
    await page.getByRole("button", { name: "Payment" }).click();
    say((await page.getByRole("button", { name: "Payment" }).getAttribute("aria-expanded")) === "true", "accordion: a header opens its section");
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForFunction(() => document.querySelector(".page-echo")?.textContent === "Page 3 of 7");
    say(true, "pagination: Next raises onPageChanged");

    /* Structure: the splitter, dragged and keyed. */
    const splitterPanes = page.locator(".demo-splitter > div:not([role=separator])");
    const paneWidth = (i) => splitterPanes.nth(i).evaluate((pane) => pane.getBoundingClientRect().width);
    const orders = page.getByRole("separator", { name: "Resize the orders", exact: true });
    await orders.scrollIntoViewIfNeeded();
    const before = await paneWidth(0);
    const bar = await orders.boundingBox();
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width / 2 + 80, bar.y + bar.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector(".splitter-echo")?.textContent?.startsWith("Pane 1:"));
    const dragged = await paneWidth(0);
    say(Math.abs(dragged - before - 80) < 4, `splitter: a drag moves the bar (${Math.round(before)} → ${Math.round(dragged)}px)`);
    const order = page.getByRole("separator", { name: "Resize the order", exact: true });
    const valueBefore = Number(await order.getAttribute("aria-valuenow"));
    await order.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction((v) => Number(document.querySelectorAll(".demo-splitter [role=separator]")[1]?.getAttribute("aria-valuenow")) < v, valueBefore);
    say(true, "splitter: the arrow keys move a focused bar (aria-valuenow follows)");
    await orders.focus();
    await page.keyboard.press("Home");
    await page.waitForFunction(() => document.querySelector(".demo-splitter [role=separator]")?.getAttribute("aria-valuenow") === "15");
    say(true, "splitter: Home takes the pane to its min (15%)");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector(".demo-splitter > div")?.getBoundingClientRect().width === 0);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (document.querySelector(".demo-splitter > div")?.getBoundingClientRect().width ?? 0) > 0);
    say(true, "splitter: Enter collapses a collapsible pane and expands it again");

    /* Sortable lists: the keyboard way (pick up, move, put down, put back, across), a fixed item, a pointer drag. */
    const sortables = page.locator("section", { has: page.getByRole("heading", { name: "Sortable lists", exact: true }) });
    await sortables.evaluate((section) => section.scrollIntoView({ block: "start", behavior: "instant" }));
    const bakes = sortables.getByRole("list", { name: "Today's bakes" });
    const soldOut = sortables.getByRole("list", { name: "Sold out" });
    const bakeItem = (text) => bakes.locator("li", { hasText: text });
    const sortOrder = (name) => page.locator(`.sortable-${name}`).textContent();
    const orderIs = (name, value) => page.waitForFunction(([n, v]) => document.querySelector(`.sortable-${n}`)?.textContent === v, [name, value]);
    const spoken = () => sortables.getByRole("status").first().textContent();
    say((await bakes.locator("li[tabindex='0']").count()) === 1, "sortable: a list is one tab stop");
    await bakeItem("Rye").focus();
    await page.keyboard.press("Space");
    say((await spoken()) === "Rye, picked up. Position 2 of 4.", `sortable: Space picks an item up, and says so (${await spoken()})`);
    await page.keyboard.press("ArrowDown");
    await orderIs("bakes", "Sourdough (fixed), Spelt, Rye, Brioche");
    await page.keyboard.press("Space");
    await sortables.getByRole("status").getByText("Rye, put down at position 3 of 4.").waitFor({ state: "attached" });
    say(true, "sortable: the arrows move it, Space puts it down");
    await bakeItem("Spelt").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowUp");
    await orderIs("bakes", "Spelt, Sourdough (fixed), Rye, Brioche");
    await page.keyboard.press("Escape");
    await orderIs("bakes", "Sourdough (fixed), Spelt, Rye, Brioche");
    // (The focus goes back to the item a frame later: wait for it before focusing another.)
    await sortables.getByRole("status").getByText("Spelt, put back.").waitFor({ state: "attached" });
    say(true, "sortable: Escape puts it back");
    await bakeItem("Sourdough").focus();
    await page.keyboard.press("Space");
    say(!(await bakeItem("Sourdough").evaluate((item) => item.hasAttribute("data-sortable-grabbed"))), "sortable: a fixed item stays put");
    await bakeItem("Brioche").focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await orderIs("sold", "Pretzel, Brioche");
    await page.keyboard.press("Space");
    await sortables.getByRole("status").getByText("Brioche, put down at position 2 of 2.").waitFor({ state: "attached" });
    say((await sortOrder("bakes")) === "Sourdough (fixed), Spelt, Rye", "sortable: the arrows across move an item to the next list of the group");
    const dragTo = async (item, target, after) => {
      const from = await item.boundingBox();
      const to = await target.boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 8, { steps: 3 });
      await page.mouse.move(to.x + to.width / 2, after ? to.y + to.height - 4 : to.y + 4, { steps: 8 });
      await page.mouse.up();
    };
    await dragTo(bakeItem("Spelt"), bakeItem("Rye"), true);
    await orderIs("bakes", "Sourdough (fixed), Rye, Spelt");
    say(true, "sortable: a pointer drag reorders");
    await dragTo(soldOut.locator("li", { hasText: "Pretzel" }), bakeItem("Rye"), false);
    await orderIs("bakes", "Sourdough (fixed), Pretzel, Rye, Spelt");
    say((await sortOrder("sold")) === "Brioche", "sortable: a pointer drag moves an item to another list of the group");
    const sortableViolations = await axe(page);
    say(sortableViolations.length === 0, `axe /structure after sorting${sortableViolations.length ? `: ${sortableViolations.join(" | ")}` : ""}`);

    /* Tree and side navigation: the current page's link, the rail's names, the tree's keys. */
    const treeSection = page.locator("section", { has: page.getByRole("heading", { name: "Tree and side navigation", exact: true }) });
    await treeSection.evaluate((section) => section.scrollIntoView({ block: "start", behavior: "instant" }));
    const sideNav = page.getByRole("navigation", { name: "Sections", exact: true });
    say((await sideNav.getByRole("link", { name: "Structure" }).getAttribute("aria-current")) === "page", "side navigation: the current page's link says so");
    const rail = page.getByRole("navigation", { name: "Sections, compact" });
    say((await rail.getByRole("link", { name: "Forms" }).getAttribute("title")) === "Forms", "side navigation: the compact rail keeps each link's name and shows it as a tooltip");
    const tree = treeSection.getByRole("tree", { name: "Menu" });
    const breadNode = tree.getByRole("treeitem", { name: /^Breads/ });
    await breadNode.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector("[role=treeitem][aria-expanded='true']") !== null);
    say((await breadNode.getAttribute("aria-expanded")) === "true", "tree: ArrowRight opens a node");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector(".tree-picked")?.textContent === "Rye");
    say((await tree.getByRole("treeitem", { name: "Rye" }).getAttribute("aria-selected")) === "true", "tree: ArrowDown and Enter select a child");
    const treeViolations = await axe(page);
    say(treeViolations.length === 0, `axe /structure with the tree open${treeViolations.length ? `: ${treeViolations.join(" | ")}` : ""}`);

    /* Charts: a chart library through @attach, the app's own SVG, server events through observe. */
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, base, "/charts");
    const canvas = page.locator(".chart-box canvas");
    const pixels = () => canvas.evaluate((element) => {
      const context = element.getContext("2d");
      const data = context.getImageData(0, 0, element.width, element.height).data;
      let ink = 0;
      let hash = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) ink++;
        hash = (hash * 31 + data[i - 1] + data[i]) % 1000000007;
      }
      return { ink, hash };
    });
    await page.waitForFunction(() => {
      const element = document.querySelector(".chart-box canvas");
      const data = element?.getContext("2d")?.getImageData(0, 0, element.width, element.height).data;
      return data !== undefined && data.some((value, i) => i % 4 === 3 && value > 0);
    }, undefined, { timeout: 30_000 });
    const thisWeek = await pixels();
    say(thisWeek.ink > 1000, `charts: Chart.js draws on the canvas the attachment gave it (${thisWeek.ink} pixels)`);
    await page.getByRole("button", { name: "Last week" }).click();
    await page.waitForFunction((before) => {
      const element = document.querySelector(".chart-box canvas");
      const data = element.getContext("2d").getImageData(0, 0, element.width, element.height).data;
      let hash = 0;
      for (let i = 3; i < data.length; i += 4) hash = (hash * 31 + data[i - 1] + data[i]) % 1000000007;
      return hash !== before;
    }, thisWeek.hash);
    say((await canvas.getAttribute("aria-label")) === "Loaves sold last week: from 99 to 171, the most on Sat." && (await page.locator(".chart-table caption").textContent()) === "Loaves sold last week", "charts: new data updates the chart in place, its text alternative and its table");
    const tiles = page.locator(".treemap .treemap__tile");
    say((await tiles.count()) === 9, `charts: the treemap draws a tile per product (${await tiles.count()})`);
    const area = (name) => page.locator(`.treemap [data-name="${name}"] rect`).evaluate((rect) => rect.getBBox().width * rect.getBBox().height);
    const ratio = (await area("Sourdough")) / (await area("Rye"));
    say(Math.abs(ratio - 340 / 210) < 0.25, `charts: a tile's area follows its value (Sourdough/Rye ${ratio.toFixed(2)}, the values ${(340 / 210).toFixed(2)})`);
    await page.waitForFunction(() => (document.querySelector(".live-ids")?.textContent?.split(" ").length ?? 0) >= 12, undefined, { timeout: 30_000 });
    const live = await page.evaluate(() => ({
      ids: document.querySelector(".live-ids").textContent.split(" ").map(Number),
      loaves: Number(document.querySelector(".live-loaves").textContent),
    }));
    say(live.ids.every((id, index) => id === index + 1), `charts: the events arrive across reconnects with nothing lost or twice (Last-Event-ID; ${live.ids.slice(0, 12).join(" ")})`);
    say(live.loaves === live.ids[live.ids.length - 1] * 12, `charts: observe renders each event (${live.loaves} loaves)`);
    const chartViolations = await axe(page);
    say(chartViolations.length === 0, `axe /charts with the data${chartViolations.length ? `: ${chartViolations.join(" | ")}` : ""}`);
    await page.emulateMedia({ reducedMotion: "no-preference" });

    say(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await page.close();
  }
} catch (error) {
  console.error(error);
  failed++;
} finally {
  await browser.close();
  for (const server of servers) server.close();
}
console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
