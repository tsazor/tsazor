---
title: Attribute splatting
keywords: attribute splatting, @attributes, CaptureUnmatchedValues
focus: App.tsazor
gate: click button
---

`FancyButton` wraps a `<button>`. Pass it a title and a click handler in `App.tsazor`:

```tsazor
<FancyButton label="Push me" title="Go on, push it." @onclick="push" />
```

TZS025 — `FancyButton` has no parameter `title`. Blazor would throw the same complaint at
runtime; Tsazor reports it while compiling. The fix is the one you know: capture unmatched
values in `FancyButton.tsazor`,

```ts
@Parameter({ captureUnmatchedValues: true }) attributes?: Record<string, unknown>;
```

and splat them onto the element:

```tsazor
<button class="fancy" @attributes="attributes">@label</button>
```

As in Blazor, `@onclick` on a component is an ordinary attribute that ends up in the capture
dictionary — it still calls `push` on `App`, which re-renders afterwards. And the last
attribute wins: with `class="fancy"` before `@attributes`, a parent's `class` replaces it.

> **Coming from Blazor:** `[Parameter(CaptureUnmatchedValues = true)] public
> Dictionary<string, object> AdditionalAttributes { get; set; }` becomes the decorator
> option `{ captureUnmatchedValues: true }` on a `Record<string, unknown>` field. Name it as
> you like — this tutorial uses `attributes`.
