---
title: Welcome to Tsazor
keywords: component, tracks, editor, preview
focus: App.tsazor
---

Welcome! This tutorial teaches you Tsazor — and since you're on the Blazor track, you already
know most of it.

New to TypeScript itself? The short chapter before this one,
[TypeScript for C# developers](blazor/types-and-nullability), maps what you know from C# to
TypeScript in nine small lessons.

## What is Tsazor?

Tsazor is **Blazor with C# replaced by TypeScript**. The component model is the one you know:
components with parameters, a render tree that gets diffed, the same lifecycle
(`onInitialized`, `onParametersSet`, `onAfterRender`), cascading values, dependency injection,
`EditForm`, routing. The markup is Razor, one to one: `@page`, `@bind`, `@onclick`,
`@foreach`, `<EditForm>`, `RenderFragment`s.

What changes is everything that is *code*. A `.tsazor` file has a `@code` block like a
`.razor` file, but what goes inside it is plain TypeScript — not C#, and not "C# written in
TypeScript syntax" either. There's no WebAssembly and no .NET runtime in the browser: Tsazor
compiles each component to a small JavaScript module.

## How this tutorial works

On the right you'll see an editor and a live preview. The preview runs the real compiler —
the same one the Vite plugin uses — right here in your browser.

Each lesson poses one small task. If you get stuck, click **Solve** to see the answer, or
**Reset** to start over. Try to finish the task yourself first, though — typing it out is how
it sticks.

Along the way, look for notes like this one:

> **Coming from Blazor:** these call out where Tsazor deliberately does something
> differently from Blazor — usually because TypeScript has its own way of doing it.

This chapter covers the basics: components, expressions, attributes, styles and raw HTML.
Click **Next** when you're ready.
