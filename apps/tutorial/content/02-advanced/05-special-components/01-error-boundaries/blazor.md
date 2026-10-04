---
title: Error boundaries
keywords: ErrorBoundary, errors, recover, ErrorContent
focus: App.tsazor
gate: click .refresh
---

Click **Refresh**: the widget's handler throws, the error lands in the console, the page doesn't
show it. Wrap the widget in Blazor's `ErrorBoundary`:

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

plus `boundary?: ErrorBoundary;` in `@code`. It's a port of Blazor's `ErrorBoundaryBase`:
render, lifecycle and event-handler errors (sync and async) of the subtree go to the nearest
boundary, `Recover()` is `recover()`, `MaximumErrorCount` (default 100) is
`maximumErrorCount`, the default UI is `<div class="blazor-error-boundary">`, and a custom
boundary derives from `ErrorBoundaryBase` and overrides `onError`.

> **Coming from Blazor:** `ErrorContent` is `(error: unknown) => RenderFragment` instead of
> `RenderFragment<Exception>` — in JavaScript anything can be thrown. Handled errors are logged
> to the console (there's no `IErrorBoundaryLogger` service). And an error **without** a
> boundary doesn't tear down the app the way an unhandled exception ends a Blazor circuit: it's
> reported (`renderer.errorHandler`, the console by default), the failed component keeps its
> last output, and the rest of the app keeps working.
