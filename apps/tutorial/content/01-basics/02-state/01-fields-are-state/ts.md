---
title: Fields are state
keywords: state, fields, @onclick, re-render
focus: App.tsazor
gate: click button
---

Time to make things interactive. A component's state is nothing special: it's the fields of
its class. There's no state hook, no signal, no wrapper type — `count = 0` is an ordinary
TypeScript class field, and changing it is an ordinary assignment.

The button on the right already calls `increment` when it's clicked (`@onclick` — more on
events in a later chapter). Fill in the method:

```tsazor
increment() {
    this.count++;
}
```

Click the button. Each click runs your method, and afterwards Tsazor renders the component
again: `buildRenderTree` produces the new markup, and only the text that changed — the
number — is updated in the DOM.

Because state is just fields, everything TypeScript gives you for classes applies: types
(`count: number = 0`), `private` and `readonly`, methods that call other methods. The
component is a class you could write by hand; the template is the part the compiler writes
for you.
