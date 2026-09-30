/**
 * Razor is code-first inside control-block bodies and @{ } blocks: statements
 * are TypeScript, markup starts at a tag in statement position.
 * Review §1: C1, C2, C3, C7, C11, C20, deferred-closure capture.
 */
import { describe, expect, it } from "vitest";
import { mount } from "../harness.js";

describe("C1 — statements inside control-block bodies", () => {
  it.fails("declares a local in an @if body and uses it in markup", async () => {
    const m = await mount(`
@if (show) {
    const label = this.title.toUpperCase();
    <p>@label</p>
}
@code { private show = true; private title = "hi"; }`);
    expect(m.html()).toBe("<p>HI</p>");
  });

  it.fails("nests a plain if (no @) inside @foreach", async () => {
    const m = await mount(`
@foreach (var n in nums) {
    if (n > 1) {
        <b>@n</b>
    }
}
@code { private nums = [1, 2, 3]; }`);
    expect(m.html()).toBe("<b>2</b><b>3</b>");
  });
});

describe("C2 — @{ } blocks", () => {
  it.fails("shares its locals with the following markup", async () => {
    const m = await mount(`@{ const greeting = "hi"; }<p>@greeting</p>`);
    expect(m.html()).toBe("<p>hi</p>");
  });

  it.fails("contains markup inside statements", async () => {
    const m = await mount(`
@{
    if (this.a) {
        <p>yes</p>
    }
}
@code { private a = true; }`);
    expect(m.html()).toBe("<p>yes</p>");
  });
});

describe("C3 — markup text inside blocks is not code", () => {
  it("keeps an apostrophe in element text", async () => {
    const m = await mount(`
@if (a) {
    <p>it's</p>
}
@code { private a = true; }`);
    expect(m.html()).toBe("<p>it's</p>");
  });

  it.fails("keeps a literal brace in element text", async () => {
    const m = await mount(`
@if (a) {
    <p>50% off {</p>
}
@code { private a = true; }`);
    expect(m.html()).toBe("<p>50% off {</p>");
  });
});

describe("C7 — further control keywords", () => {
  it.fails("@while renders each iteration", async () => {
    const m = await mount(`
@{ let i = 0; }
@while (i < 3) {
    <i>@i</i>
    i++;
}`);
    expect(m.html()).toBe("<i>0</i><i>1</i><i>2</i>");
  });

  it.fails("@do … while renders at least once", async () => {
    const m = await mount(`
@{ let i = 5; }
@do {
    <i>@i</i>
    i++;
} while (i < 3);`);
    expect(m.html()).toBe("<i>5</i>");
  });

  it.fails("@try / catch renders the catch branch", async () => {
    const m = await mount(`
@try {
    const v = this.risky();
    <p>@v</p>
} catch (e) {
    <p>caught</p>
}
@code { private risky(): string { throw new Error("x"); } }`);
    expect(m.html()).toBe("<p>caught</p>");
  });
});

describe("C11 — @switch", () => {
  it.fails("falls through stacked case labels", async () => {
    const m = await mount(`
@switch (k) {
    case 1:
    case 2:
        <p>low</p>
        break;
    default:
        <p>other</p>
        break;
}
@code { private k = 1; }`);
    expect(m.html()).toBe("<p>low</p>");
  });
});

describe("C20 — @: line transitions", () => {
  it.fails("processes @ expressions on a @: line", async () => {
    const m = await mount(`
@if (true) {
    @:Hello @name!
}
@code { private name = "Ada"; }`);
    expect(m.text()).toBe("Hello Ada!");
  });
});

describe("loop variables captured by deferred child content", () => {
  it.fails("each child content sees its own iteration value", async () => {
    const m = await mount({
      "Test.tsazor": `
@for (var i = 0; i < 3; i++) {
    <Wrap>@i</Wrap>
}`,
      "Wrap.tsazor": `<span>@ChildContent</span>\n@code { @Parameter() ChildContent?: RenderFragment; }`,
    });
    expect(m.text()).toBe("012");
  });
});
