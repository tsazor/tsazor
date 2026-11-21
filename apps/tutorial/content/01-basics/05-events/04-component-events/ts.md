---
title: Component events
keywords: EventCallback, component events, invokeAsync
focus: Inner.tsazor
gate: click button
---

DOM elements have events; your components can have them too. `Inner` should tell its parent
when its button was clicked. A component event is a parameter of type `EventCallback`:

```ts
@Parameter() onMessage?: EventCallback<string>;

async sayHello() {
    await this.onMessage?.invokeAsync("Hello!");
}
```

The type argument is what the event carries — a `string` here. `invokeAsync` calls the
parent's handler and returns a promise that settles when the handler is done (handlers can
be async too). The `?.` covers parents that don't listen.

Now listen in `App.tsazor`, with a method name like any event:

```tsazor
<Inner onMessage="handleMessage" />
```

Click the button: the message appears in `App`. Why an `EventCallback` and not just a
function parameter — `onMessage?: (text: string) => void`? Both would call
`handleMessage`. But an `EventCallback` belongs to the component that passed it, and
Tsazor renders *that* component after the handler ran, exactly like after a DOM event. With
a plain function, `App` would update its field and not re-render.

By convention, event parameters are named `on…`: `onMessage`, `onSelect`, `onClose`.
