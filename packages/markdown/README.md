# @tsazor/markdown

Markdown for [Tsazor](https://github.com/tsazor/tsazor#readme): a `Markdown` component that renders GitHub Flavored Markdown with
[marked](https://marked.js.org) and sanitizes the result with [DOMPurify](https://github.com/cure53/DOMPurify). The
text is never trusted, so an app can show an agent's answer or a user's comment without knowing about XSS.

```bash
pnpm add @tsazor/markdown
```

```ts
import "@tsazor/markdown/markdown.css";
```

```razor
@import { Markdown } from "@tsazor/markdown"

<Markdown Value="@answer" Breaks="true" />
```

- **Sanitized, always.** Scripts, event handlers (`onerror`), `javascript:` links, `style` attributes and tags, and
  forms are removed. `AllowTags`/`AllowAttributes` add to the allowed set for content the app trusts more.
- **Links.** A link to another origin opens in a new tab with `rel="noopener noreferrer"`
  (`ExternalLinks="same-tab"` keeps it in the same tab); a link in the app stays in the app.
- **GitHub Flavored Markdown:** tables, task lists (their checkboxes are named by the item's text), strikethrough,
  autolinks. `Breaks="true"` makes a single newline a line break, as chat text expects.
- **Code.** Fenced code is shown as text with a `language-*` class. `Highlight` takes a highlighter, e.g.
  highlight.js: `Highlight="@((code, language) => hljs.highlight(code, { language }).value)"`; its HTML is sanitized
  too.
- **`Inline="true"`** renders one line (emphasis, code, links) into a span.
- **`TableClass`** puts a class on tables (Bootstrap: `TableClass="table"`).
- **The look** comes from `markdown.css` in the skin's tokens: Fluent's `--fui-*`, else Bootstrap's `--bs-*`, else
  neutral values. Each value is a `--tz-markdown-*` property you can override.
- **`renderMarkdown(text, options)`** gives the sanitized HTML for use outside the component.
- **A changing value** (an answer that streams in) renders again on each change; the same text and options don't
  parse again.

Ported from MudBlazor's `MudMarkdown`: `Value` stays `Value`, a Markdig pipeline becomes the options above.

Tests: DOMPurify needs a real DOM. It doesn't sanitize under happy-dom (it keeps `onerror`), so this package tests
under jsdom, and the skins app's gate checks the sanitizing in Edge, Firefox and WebKit.

marked is MIT-licensed; DOMPurify is MPL-2.0 or Apache-2.0.
