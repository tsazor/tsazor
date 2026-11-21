---
title: Error boundaries
keywords: ErrorBoundary, errors, recover, ErrorContent
focus: App.tsazor
gate: click .refresh
---

Click **Refresh** on the weather widget. It throws — the error shows up in the console below
the preview, and on the page… nothing. The user sees a widget that silently stopped working.

An `ErrorBoundary` puts a fence around part of the page. When something inside it fails, the
boundary replaces its content with an error view and the rest of the page carries on:

```tsazor
@import { ErrorBoundary } from "@tsazor/runtime"

<ErrorBoundary @ref="boundary">
    <ChildContent>
        <Weather />
    </ChildContent>
    <ErrorContent Context="error">
        <section class="failed">
            <p>The weather widget failed: @error.message</p>
            <button @onclick="() => boundary?.recover()">Try again</button>
        </section>
    </ErrorContent>
</ErrorBoundary>
```

with a field for the reference: `boundary?: ErrorBoundary;` (that's what the `@import` is for).
Click **Refresh** again: the widget turns into the error view, `Notes` stays as it was. **Try
again** calls `recover()`, which renders the child content afresh.

A boundary catches what goes wrong *below* it: rendering, lifecycle methods like
`onInitialized`, and event handlers — sync or async. Keep the error view itself simple: if it
fails too, there's nothing left to fall back on. `error` is whatever was thrown;
usually an `Error`, so `@error.message` is the common case. Without `ErrorContent` the boundary
shows an empty default element (a `div` with a fixed class) that you can style.

Where to put boundaries: around things that can fail independently — a widget, a page in a
router, a third-party component. One at the top of the app is a good safety net; a few close
to risky parts keep the rest usable.
