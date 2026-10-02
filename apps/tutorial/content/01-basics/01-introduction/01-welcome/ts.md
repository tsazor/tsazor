---
title: Welcome to Tsazor
focus: App.tsazor
---

Welcome! This tutorial teaches you everything you need to build web apps with Tsazor.

## What is Tsazor?

Tsazor is a component framework for TypeScript. You describe your UI as **components** —
files that combine markup, styles and behavior. Each `.tsazor` file is an HTML-like template
with `@` expressions in it, plus a TypeScript class that holds the component's state and
methods.

The compiler turns every component into a small JavaScript module. When state changes, the
component renders again, Tsazor diffs the result against the previous render, and only what
actually changed is touched in the DOM.

If you've used React, Vue or Svelte, a lot of this will feel familiar: components, props
(here they're called *parameters*), events, two-way binding, a router. Where Tsazor differs,
we'll point it out.

## How this tutorial works

On the right there's an editor and a live preview. The preview runs the real Tsazor compiler
right here in your browser.

Each lesson poses one small task. If you get stuck, click **Solve** to see the answer, or
**Reset** to start over. Try to solve the task yourself first, though — typing it out is how
it sticks.

The first chapter covers the basics: components, expressions, attributes, styles and raw
HTML. Click **Next** when you're ready.
