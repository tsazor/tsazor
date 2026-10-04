---
title: Properties and access
keywords: private, readonly, getter, access modifiers, static
focus: thermostat.ts
typeErrors: true
gate: click button
---

A C# property is a getter/setter pair in TypeScript, and from the outside it looks the same:
`thermostat.celsius = 22` calls the setter. An auto-property (`{ get; set; }`) is just a
public field; `{ get; }` is a `readonly` field.

The preview shows no Fahrenheit value at all, and the problems panel says why: `Thermostat`
has no `fahrenheit` (TS2339), so the markup reads `undefined`, which renders as nothing. (Click
the button and it's `NaN`: the code still runs, it just runs wrong.) Add `fahrenheit` as a
computed property with a setter:

```ts
get fahrenheit(): number {
    return this.celsius * 9 / 5 + 32;
}

set fahrenheit(value: number) {
    this.celsius = (value - 32) * 5 / 9;
}
```

The button now raises the temperature by 9 °F, and the setter goes through `celsius`, so the
range check applies.

| C# | TypeScript |
| --- | --- |
| `public` (default: `private`) | `public` is the default, so you rarely write it |
| `private` | `#celsius` (enforced at runtime) or `private` (compile time only) |
| `protected` | `protected` |
| `internal` | not exported from the module |
| `readonly` field, `{ get; }` | `readonly` |
| `static` | `static` |
| `public Thermostat(string room) => Room = room;` | `constructor(room: string) { this.room = room; }` |

> **Coming from C#:** members are **public by default**, the opposite of C#. And TypeScript's
> `private` and `readonly` are checked by the compiler only: at runtime, a `private` field is
> an ordinary property that shows up in `JSON.stringify` and in the debugger. `#celsius` is
> JavaScript's own private field: invisible outside the class, even at runtime. Use `#` for
> real encapsulation, as here. Inside the class, `this.` is never optional.
