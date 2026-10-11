# C# to TypeScript

A cheat sheet for C# developers writing the TypeScript side of a Tsazor app. Most of what you
know carries over: TypeScript and C# share a designer, and classes, interfaces, generics,
lambdas, `async`/`await`, `?.` and `??` look the way you expect. The tables below map the rest.

This page goes with the tutorial's Blazor-track chapter **"TypeScript for C# developers"**
(`apps/tutorial`, nine short lessons, each with a live preview). For the component side (Razor
markup, parameters, lifecycle, DI), see the [language reference](language-reference.md).

- [Language](#language): types and nullability, async, LINQ, classes and structural typing,
  properties and access, attributes, modules, records/enums/unions, functions
- [The real traps](#the-real-traps)
- [Base class library](#base-class-library): strings, numbers and `decimal`, collections,
  dates, exceptions, disposal and cancellation, everything else
- [Naming](#naming)

## Language

### Types, inference, nullability

| C# | TypeScript |
| --- | --- |
| `var total = 0;` | `let total = 0;` (inferred: `number`) |
| `const int Max = 5;`, a `readonly` local | `const max = 5;` (no reassignment; the object it holds can still change) |
| `int`, `long`, `double`, `float`, `decimal` | `number` (a double; see [Numbers](#numbers-and-decimal)) |
| `long` beyond 2^53, `BigInteger` | `bigint` (`10n`) |
| `bool`, `string`, `char` | `boolean`, `string`, `string` (no char type) |
| `object` / `dynamic` | `unknown` (narrow before use) / `any` (avoid: switches checking off) |
| `string? note` (nullable reference) | `note: string \| null` |
| `int? quantity` (may be absent) | `quantity?: number` (adds `undefined`) |
| `<Nullable>enable</Nullable>` (warnings) | `"strict": true` (errors; required by `tsazor check`) |
| `x?.Name`, `x ?? fallback`, `x ??= y` | the same: `x?.name`, `x ?? fallback`, `x ??= y` |
| `x!` (null-forgiving) | `x!` (non-null assertion) |
| `default(T)` | none; `undefined` for "no value" |
| `is string s`, `is Order o` | `typeof x === "string"`, `x instanceof Order`, `"id" in x` (all narrow) |
| `x as Order` (checked, null on failure) | `x as Order` (an unchecked assertion: no runtime effect) |
| `(int, string) pair` | `[number, string]` (a tuple) |
| `var (a, b) = pair;` | `const [a, b] = pair;`, `const { id, name } = order;` |

Two "nothing" values: `undefined` (not there: a missing property, an optional parameter, an
unassigned variable) and `null` (set on purpose). `?.` and `??` treat both alike; `x == null`
matches both. TypeScript is not truthiness-free like C#: `||` falls back on `0`, `""`, `false`
and `NaN` too. Use `??` for defaults.

### Async

`async`/`await` is nearly identical. A promise, like a `Task`, is already running when you get
it.

| C# | TypeScript |
| --- | --- |
| `Task`, `Task<T>`, `ValueTask<T>` | `Promise<void>`, `Promise<T>` |
| `async Task<User> LoadAsync()` | `async loadAsync(): Promise<User>` (the suffix stays, as in Tsazor's API) |
| `await Task.WhenAll(a, b)` | `await Promise.all([a, b])` (typed tuple; rejects on the first failure) |
| inspecting every task after `WhenAll` | `await Promise.allSettled([a, b])` |
| `await Task.WhenAny(a, b)` | `await Promise.race([a, b])` (first to settle), `Promise.any` (first to succeed) |
| `Task.FromResult(x)`, `Task.CompletedTask` | `Promise.resolve(x)`, `Promise.resolve()` |
| `await Task.Delay(500)` | `await new Promise((resolve) => setTimeout(resolve, 500))` |
| `TaskCompletionSource<T>` | `new Promise<T>((resolve, reject) => …)`, or `Promise.withResolvers<T>()` (ES2024) |
| `IAsyncEnumerable<T>`, `await foreach` | `AsyncIterable<T>`, `for await (const x of xs)` |
| `.Result`, `.Wait()` | none: you can't block on a promise |
| `ConfigureAwait(false)`, `SynchronizationContext` | none: one thread, the code after `await` always runs later |
| `async void` | none; the remaining trap is a *forgotten* `await` (not a type error) |
| `CancellationToken` | `AbortSignal` (see [Disposal and cancellation](#disposal-and-cancellation)) |
| `Parallel.ForEach`, `Thread` | none on the main thread; Web Workers for CPU-heavy work |
| `lock` | not needed: no shared-memory threads |

### LINQ to Objects

The array methods run **immediately** and return new arrays: no deferred execution, no
`ToList()`.

| LINQ | Array |
| --- | --- |
| `Where(o => o.Open)` | `filter((o) => o.open)` |
| `Select(o => o.Name)` | `map((o) => o.name)` |
| `Select((o, i) => …)` | `map((o, i) => …)` |
| `SelectMany(o => o.Lines)` | `flatMap((o) => o.lines)` |
| `Aggregate(seed, f)`, `Sum(o => o.Total)` | `reduce(f, seed)`, `reduce((s, o) => s + o.total, 0)` (always pass the seed) |
| `First(…)` / `FirstOrDefault(…)` | `find(…)` (returns `undefined`; there's no throwing `First`) |
| `Last(…)`, `LastOrDefault(…)` | `findLast(…)` (ES2023), `at(-1)` |
| `Any(…)` / `All(…)` | `some(…)` / `every(…)` |
| `Any()` / `Count()` | `length > 0` / `length` |
| `Contains(x)`, `IndexOf(x)` | `includes(x)`, `indexOf(x)` / `findIndex(…)` |
| `OrderBy(o => o.Total)` | `toSorted((a, b) => a.total - b.total)` (ES2023) |
| `OrderByDescending(…)` | `toSorted((a, b) => b.total - a.total)` |
| `OrderBy(o => o.Name)` | `toSorted((a, b) => a.name.localeCompare(b.name))` |
| `ThenBy(…)` | `toSorted((a, b) => a.x - b.x \|\| a.y - b.y)` |
| `Reverse()` | `toReversed()` (ES2023) |
| `Take(n)` / `Skip(n)` | `slice(0, n)` / `slice(n)` |
| `Distinct()` | `[...new Set(xs)]` |
| `GroupBy(o => o.Status)` | `Object.groupBy(xs, (o) => o.status)` / `Map.groupBy` (ES2024) |
| `ToDictionary(o => o.Id)` | `new Map(xs.map((o) => [o.id, o]))` |
| `Zip(a, b)` | `a.map((x, i) => [x, b[i]])` |
| `Concat(b)` | `[...a, ...b]` or `a.concat(b)` |
| `Enumerable.Range(0, n)` | `Array.from({ length: n }, (_, i) => i)` |
| `yield return` | a generator: `function* items() { yield 1; }` |

Two traps: `sort()` and `reverse()` work **in place** (prefer `toSorted()`/`toReversed()`),
and `sort()` without a comparer compares as strings (`[10, 9, 1].sort()` is `[1, 10, 9]`).
`toSorted`, `toReversed` and `findLast` are ES2023 — the recommended tsconfig (see
[Getting started](getting-started.md)) already includes the ES2023 lib, so they type-check
out of the box; `Object.groupBy` needs ES2024.

### Classes, interfaces, generics

| C# | TypeScript |
| --- | --- |
| `class Customer : Person, INamed` | `class Customer extends Person implements Named` |
| `public Customer(string name) { Name = name; }` | `constructor(name: string) { this.name = name; }` |
| primary constructor `class C(string name)` | parameter properties: `constructor(readonly name: string) {}` |
| `base(name)`, `base.Save()` | `super(name)`, `super.save()` |
| `abstract`, `override`, `static` | `abstract`, `override`, `static` |
| `sealed`, `virtual` | none: every method can be overridden |
| `interface INamed { string Name { get; } }` | `interface Named { readonly name: string; }` |
| `T Max<T>(…) where T : IComparable<T>` | `max<T extends Comparable<T>>(…): T` |
| `where T : class` / `where T : new()` | `T extends object` / pass a factory: `create: () => T` |
| `typeof(T)`, `new T()` | none: types are erased at runtime (TS2693) |
| method overloads | overload signatures over one implementation, or optional/union parameters |
| extension methods | plain functions (`formatMoney(order.total)`) |
| `this.` optional | `this.` required inside a class |

**Structural typing.** The one real conceptual difference: TypeScript compares types by
*shape*, not by declaration. Anything with `name: string` is a `Named`, whether or not it says
`implements Named`, and a plain object literal is as good as a class instance. That's what lets
an `interface` describe JSON from your API directly, with no DTO class and no mapping. It
follows that interfaces don't exist at runtime (`x instanceof Named` is an error; write a type
guard, `function isNamed(x: unknown): x is Named`), and that two aliases of the same type are
interchangeable: `type CustomerId = string` and `type OrderId = string` mix freely. When that
matters, brand them: `type CustomerId = string & { readonly __brand: "CustomerId" }`. Fresh
object literals are checked strictly (an unknown property is an error), variables aren't.

### Properties and access

| C# | TypeScript |
| --- | --- |
| `public string Name { get; set; }` | `name: string;` (a public field) |
| `public string Name { get; }` | `readonly name: string;` |
| `public int Doubled => count * 2;` | `get doubled() { return this.count * 2; }` |
| `{ get => …; set { … } }` | `get x() { … }` and `set x(value) { … }` |
| `public` | the default (C#'s default is `private`) |
| `private int _count;` | `#count = 0;` (enforced at runtime) or `private count = 0;` (compile time only) |
| `protected` | `protected` |
| `internal` | don't export it from the module |
| `static readonly` | `static readonly`, or a module-level `const` |
| `required` members | non-optional properties: object literals must supply them |

TypeScript's `private`, `protected` and `readonly` are checked by the compiler only; at runtime
a `private` field is an ordinary property (visible in `JSON.stringify` and the debugger). `#`
fields are private at runtime too.

### Attributes and decorators

| C# | TypeScript / Tsazor |
| --- | --- |
| `[Parameter]` | `@Parameter()` |
| `[Parameter(CaptureUnmatchedValues = true)]` | `@Parameter({ captureUnmatchedValues: true })` |
| `[CascadingParameter]` | `@CascadingParameter()` |
| `[Inject]` | the `@inject Type Name` directive |
| `[Required]`, `[StringLength(80)]`, `[Range(1, 10)]` | `@Required()`, `@StringLength(80)`, `@Range(1, 10)` |
| `[EmailAddress]`, `[RegularExpression(…)]`, `[Compare(…)]` | `@EmailAddress()`, `@RegularExpression(…)`, `@Compare(…)` |
| reading attributes via reflection | decorator metadata (`context.metadata`, `Symbol.metadata`) |

An attribute is passive metadata. A decorator is a **function** that runs once, when the class
is defined, and may replace what it decorates (a method decorator returning a wrapper is an
interceptor). Decorators apply to classes and class members only, not to parameters,
interfaces or free functions. Tsazor uses the **standard** (TC39) decorators: keep
`experimentalDecorators` out of `tsconfig.json`.

### Namespaces and modules

Every file is a module: what it exports is public, everything else is private to the file.

| C# | TypeScript |
| --- | --- |
| `namespace Shop.Billing;` | none: the file is the unit |
| `public static class Money { public static … }` | a module of exported functions |
| `internal` | not exported |
| `using Shop.Billing;` | `import { formatMoney } from "./money";` |
| `using static …` | the same `import` |
| `using Alias = …;` | `import { formatMoney as format } from "./money";` |
| `global using`, `_Imports.razor` | `_Imports.tsazor` (for `.tsazor` files only) |
| static constructor | module top-level code (runs once, on first import) |
| assembly / NuGet package | npm package: `import { … } from "@tsazor/runtime";` |
| type-only reference | `import type { Order } from "./orders";` (erased from the output) |

In `.tsazor` files, the same import is written `@import { formatMoney } from "./money"`. Prefer
named exports over `export default`.

### Records, enums, unions

| C# | TypeScript |
| --- | --- |
| `record Order(int Id, string Customer)` | `interface Order { readonly id: number; readonly customer: string; }` + object literals |
| `order with { Status = … }` | `{ ...order, status: "shipped" }` |
| record value equality (`a == b`) | none: objects compare by reference; compare fields or ids |
| `struct` | none: objects are always references; copy with spread or `structuredClone(x)` |
| `enum Status { Open, Shipped }` | `type Status = "open" \| "shipped";` (a string-literal union) |
| `Enum.GetValues<Status>()` | `const STATUSES = ["open", "shipped"] as const;` `type Status = (typeof STATUSES)[number];` |
| `[Flags] enum` | a `Set<Permission>` or an object of booleans |
| exhaustive `switch` expression | `switch` over a union: TypeScript knows when every case returns |
| `Result<T>` / a class hierarchy | a discriminated union: `{ ok: true; value: T } \| { ok: false; error: string }` |
| `switch` with patterns | `switch (x.kind)` on the discriminant, which narrows `x` per case |

TypeScript has an `enum`, but it's one of the few features that generates JavaScript code; use
unions. A union's values are the data itself: what the JSON contains and what you see in the
debugger.

### Functions and delegates

| C# | TypeScript |
| --- | --- |
| `Func<int, string>` | `(n: number) => string` |
| `Action`, `Action<T>` | `() => void`, `(x: T) => void` |
| `Predicate<T>` | `(x: T) => boolean` |
| lambda `x => x * 2` | arrow function `(x) => x * 2` |
| local function | nested `function` or `const f = () => …` |
| `params int[] xs` | rest parameter `...xs: number[]` |
| optional parameter `int x = 0` | `x = 0` or `x?: number` |
| named arguments | an options object: `fetch(url, { method: "POST" })` |
| `out` / `ref` parameters | return a tuple or an object |
| `event EventHandler<T>` | a callback, `EventTarget`, or `EventCallback<T>` in components |
| `nameof(Order.Total)` | none; `keyof Order` at the type level |

## The real traps

| Trap | What happens | Do this |
| --- | --- | --- |
| `this` in callbacks | in `function () { … }` callbacks and methods passed by name (`setTimeout(this.tick)`), `this` is not your object | arrow functions: `() => this.tick()` (markup handlers like `@onclick="save"` are bound for you) |
| `==` | converts before comparing: `"0" == 0` and `"" == 0` are `true` | `===` / `!==`; `x == null` is the one accepted `==` |
| `number` is a double | `0.1 + 0.2` is `0.30000000000000004`; `7 / 2` is `3.5` | integer cents for money; `Math.trunc` for integer division |
| `Date` months | `new Date(2026, 9, 2)` is **October** 2nd | see [Dates and times](#dates-and-times) |
| `Date` parsing | `new Date("2026-10-02")` is midnight **UTC** (October 1st in New York) | keep ISO strings; convert at the edges |
| `\|\|` for defaults | falls back on `0`, `""`, `false` | `??` |
| `sort()` | sorts in place, as strings without a comparer | `toSorted((a, b) => a - b)` |
| `string.replace("a", "b")` | replaces the **first** match only | `replaceAll` |
| `Number("")` | is `0`, not an error | check `s.trim() !== ""` first |
| `catch (error)` | `error` is `unknown` (anything can be thrown) | `if (error instanceof Error) …` |
| a forgotten `await` | not a type error; failures become unhandled rejections | lint for floating promises |

## Base class library

### Strings

| C# | TypeScript |
| --- | --- |
| `$"Hello {name}"` | `` `Hello ${name}` `` |
| `@"C:\path"`, raw strings | `` String.raw`C:\path` `` |
| `s.Length` | `s.length` |
| `s.ToUpper()`, `s.ToLower()` | `s.toUpperCase()`, `s.toLowerCase()` |
| `s.Contains(x)`, `s.StartsWith(x)`, `s.EndsWith(x)` | `s.includes(x)`, `s.startsWith(x)`, `s.endsWith(x)` |
| `s.IndexOf(x)`, `s.LastIndexOf(x)` | `s.indexOf(x)`, `s.lastIndexOf(x)` |
| `s.Substring(start, length)` | `s.slice(start, start + length)` (the second argument is an **end** index) |
| `s.Substring(start)`, `s[^3..]` | `s.slice(start)`, `s.slice(-3)` |
| `s.Replace(a, b)` | `s.replaceAll(a, b)` |
| `s.Split(',')`, `string.Join(", ", xs)` | `s.split(",")`, `xs.join(", ")` |
| `s.Trim()`, `TrimStart()`, `TrimEnd()` | `s.trim()`, `trimStart()`, `trimEnd()` |
| `s.PadLeft(5, '0')` | `s.padStart(5, "0")` |
| `string.IsNullOrEmpty(s)` | `!s` (for `string \| null \| undefined`) |
| `string.IsNullOrWhiteSpace(s)` | `!s?.trim()` |
| `string.Compare(a, b, culture)` | `a.localeCompare(b, "de")` |
| `string.Equals(a, b, OrdinalIgnoreCase)` | `a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0` |
| `new string('-', 3)` | `"-".repeat(3)` |
| `StringBuilder` | push parts into an array and `join("")`, or `+=` (fast in JavaScript) |
| `s[0]` (a `char`) | `s[0]` (a one-character string), `s.at(-1)` |
| `Regex.IsMatch(s, @"\d+")` | `/\d+/.test(s)` |
| `Regex.Matches(…)` | `s.matchAll(/…/g)` |

### Numbers and `decimal`

| C# | TypeScript |
| --- | --- |
| `int.Parse(s)` | `Number(s)` (`NaN` instead of an exception; `Number("")` is `0`) |
| `int.TryParse(s, out var n)` | `const n = Number(s); if (Number.isInteger(n)) …` |
| `parse "12px"` leniently | `parseInt(s, 10)`, `parseFloat(s)` |
| `double.NaN`, `double.IsNaN(x)` | `NaN`, `Number.isNaN(x)` |
| `int.MaxValue` | `Number.MAX_SAFE_INTEGER` (2^53 − 1, the exact-integer limit) |
| `7 / 2` (integer division) | `Math.trunc(7 / 2)` |
| `Math.Round(x)` (to even) | `Math.round(x)` (half up: `Math.round(2.5)` is 3, `Math.round(-2.5)` is −2) |
| `x.ToString("N2")`, `x.ToString("C")` | `new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2 }).format(x)`, `{ style: "currency", currency: "EUR" }` |
| `x.ToString("F2")` | `x.toFixed(2)` (binary rounding: `(1.005).toFixed(2)` is `"1.00"`) |
| `checked` overflow | none: `number` loses precision silently past 2^53 |

**There is no `decimal`.** Every `number` is an IEEE 754 double. Options for money, best first:

1. **Keep money math on the .NET backend.** `decimal` stays where it is; the frontend displays
   amounts and sends user input back. This is the natural split for a team that keeps its
   backend.
2. **Integer minor units.** Store cents as a `number`: integers are exact up to
   `Number.MAX_SAFE_INTEGER`, about 90 trillion euros in cents. Round once at the boundary:
   `Math.round(price * 100)`.
3. **`bigint`** for integer arithmetic beyond 2^53 (no fractions, no mixing with `number`).
4. **A decimal library** (`decimal.js`, `big.js`, `dinero.js`) when the frontend must calculate
   with arbitrary precision.

On the wire: System.Text.Json writes `decimal` as a JSON number, and `JSON.parse` reads it as a
double, so values with more than 15 significant digits lose precision. Where that matters,
serialize them as strings (`JsonNumberHandling.WriteAsString`) and parse them with a decimal
library. Format with `Intl.NumberFormat`, never by hand.

### Collections

| C# | TypeScript |
| --- | --- |
| `List<T>`, `T[]` | `T[]` |
| `IReadOnlyList<T>`, `ImmutableArray<T>` | `readonly T[]` (compile-time) |
| `list.Add(x)`, `AddRange(xs)` | `list.push(x)`, `list.push(...xs)` |
| `list.Insert(i, x)`, `RemoveAt(i)` | `list.splice(i, 0, x)`, `list.splice(i, 1)` |
| `list.Remove(x)` | `list.splice(list.indexOf(x), 1)`, or `list = list.filter((y) => y !== x)` |
| `list.Count`, `list.Clear()` | `list.length`, `list.length = 0` |
| `list[^1]` | `list.at(-1)` |
| `new List<T>(other)` | `[...other]` |
| `Dictionary<TKey, TValue>` | `Map<K, V>` |
| `dict[key] = value`, `dict.Add(key, value)` | `map.set(key, value)` |
| `dict.TryGetValue(key, out var v)` | `const v = map.get(key); if (v !== undefined) …` |
| `dict.ContainsKey(key)`, `Remove(key)`, `Count` | `map.has(key)`, `map.delete(key)`, `map.size` |
| `foreach (var (key, value) in dict)` | `for (const [key, value] of map)` |
| `dict.Keys`, `dict.Values` | `[...map.keys()]`, `[...map.values()]` |
| JSON object with string keys | `Record<string, V>` (`{ [key: string]: V }`) |
| `HashSet<T>` | `Set<T>`: `add`, `has`, `delete`, `size` |
| `UnionWith`, `IntersectWith`, `ExceptWith` | `a.union(b)`, `a.intersection(b)`, `a.difference(b)` (ES2025, current browsers) |
| `Queue<T>` | an array: `push` / `shift` |
| `Stack<T>` | an array: `push` / `pop` |
| `KeyValuePair<K, V>` | `[K, V]` |
| `IEnumerable<T>` | `Iterable<T>` |
| `ConditionalWeakTable` | `WeakMap` |

`Map` and `Set` compare object keys **by reference** (there's no `GetHashCode`/`Equals`
override); key them by an id. For values the component renders, prefer arrays and plain objects
and replace them rather than mutating where change tracking matters.

### Dates and times

| C# | TypeScript |
| --- | --- |
| `DateTime.Now`, `DateTime.UtcNow` | `new Date()` (an instant; it shows in local time, `toISOString()` in UTC) |
| `DateTimeOffset` | `Date` for the instant; keep the offset separately if you need it |
| `DateOnly` | an ISO date string, `"2026-10-02"` |
| `DateTime.Parse(iso)` | `new Date(iso)` (a date-only string is midnight **UTC**) |
| `new DateTime(2026, 10, 2)` | `new Date(2026, 9, 2)` (months from **0**, local time) |
| `d.Year`, `d.Month`, `d.Day` | `d.getFullYear()`, `d.getMonth() + 1`, `d.getDate()` |
| `d.AddDays(1)` | `const next = new Date(d); next.setDate(next.getDate() + 1);` (`Date` is **mutable**: copy first) |
| `TimeSpan` | a number of milliseconds |
| `b - a` (a `TimeSpan`) | `b.getTime() - a.getTime()` |
| `d.ToString("d", culture)` | `new Intl.DateTimeFormat("de-DE").format(d)` |
| `d.ToString("o")` | `d.toISOString()` |
| `Stopwatch` | `performance.now()` |

For date math (business days, time zones, recurrences), use a library such as `date-fns` or
Luxon. The `Temporal` API, a modern replacement for `Date` with real dates, times and zones, is
arriving in browsers; use it (or its polyfill) once your target browsers support it. Exchange
dates with the backend as ISO 8601 strings (System.Text.Json's default) and convert at the edges.

### Exceptions

| C# | TypeScript |
| --- | --- |
| `throw new InvalidOperationException("…")` | `throw new Error("…")` |
| `ArgumentException`, `ArgumentOutOfRangeException` | `TypeError`, `RangeError`, or your own |
| `class NotFoundException : Exception` | `class NotFoundError extends Error { name = "NotFoundError"; }` |
| `catch (NotFoundException e)` | `catch (error) { if (error instanceof NotFoundError) … else throw error; }` |
| `catch (…) when (filter)` | an `if` in the `catch`, rethrow the rest |
| `e.Message`, `e.StackTrace` | `error.message`, `error.stack` |
| `e.InnerException` | `new Error("…", { cause: inner })`, `error.cause` |
| `AggregateException` | `AggregateError` (from `Promise.any`) |
| `OperationCanceledException` | a `DOMException` named `"AbortError"` (`error.name === "AbortError"`) |
| `finally` | `finally` |
| `TaskScheduler.UnobservedTaskException` | the `unhandledrejection` event |

`catch` has no type filter, and the caught value is `unknown`: anything can be thrown, so
narrow with `instanceof Error` before reading `message`. In components, `ErrorBoundary` works
as in Blazor.

### Disposal and cancellation

| C# | TypeScript / Tsazor |
| --- | --- |
| `IDisposable.Dispose()` on a component | a `dispose()` method on the component |
| `IAsyncDisposable.DisposeAsync()` | `disposeAsync()` (takes precedence over `dispose()`) |
| a disposable DI service | a service with `dispose()`: the container disposes what it created |
| `using var x = …;` | `try { … } finally { x.dispose(); }`, or `using x = …;` (TypeScript 5.2+, `Symbol.dispose`) |
| `CancellationTokenSource` | `AbortController` |
| `cts.Token` | `controller.signal` |
| `cts.Cancel()` | `controller.abort()` |
| `token.IsCancellationRequested` | `signal.aborted` |
| `token.ThrowIfCancellationRequested()` | `signal.throwIfAborted()` |
| `token.Register(callback)` | `signal.addEventListener("abort", callback)` |
| `cts.CancelAfter(5000)` | `AbortSignal.timeout(5000)` |
| linked token sources | `AbortSignal.any([a, b])` |
| unsubscribing an event in `Dispose` | `addEventListener(type, handler, { signal })` |
| "cancel when the component goes away" | `this.disposeSignal` (Tsazor: aborts on dispose) |

`fetch(url, { signal: this.disposeSignal })` is the component-side counterpart of passing a
`CancellationToken` to `HttpClient`. For subscriptions, `this.observe(source)` subscribes,
re-renders on every value and unsubscribes on dispose.

### Everything else

| C# | TypeScript |
| --- | --- |
| `Console.WriteLine(x)` | `console.log(x)` (also `console.error`, `console.table`) |
| `Debug.Assert(cond)` | `console.assert(cond)` |
| `Guid.NewGuid()` | `crypto.randomUUID()` |
| `new Random().Next(n)` | `Math.floor(Math.random() * n)` (`crypto.getRandomValues` for security) |
| `JsonSerializer.Serialize(x)` | `JSON.stringify(x)` |
| `JsonSerializer.Deserialize<T>(s)` | `JSON.parse(s) as T` (no validation: it's an assertion) |
| `HttpClient` | `fetch`, or the typed backend client from `@tsazor/dotnet` |
| `Environment` / `IConfiguration` | `import.meta.env` (Vite) |
| `GetType().Name` | `x.constructor.name`, `typeof x` for primitives |
| `Lazy<T>` | a getter that caches, or a module-level `const` |
| `ToString()` override | `toString()` (used by string conversion) |
| `Equals`/`GetHashCode` | none: write an `equals(other)` method if you need one |
| `IComparable<T>` | a comparer function `(a, b) => number` |

## Naming

| C# | TypeScript |
| --- | --- |
| `PascalCase` methods and properties | `camelCase` methods and properties |
| `PascalCase` types | `PascalCase` types |
| `_camelCase` private fields | `#camelCase` |
| `IOrderService` | `OrderService` (no `I` prefix) |
| `LoadAsync` | `loadAsync` (the suffix stays, as in Tsazor's API: `refreshDataAsync`, `invokeAsync`) |
| `const` `PascalCase` | `camelCase`, or `UPPER_CASE` for true constants |
| `OrderService.cs` | `order-service.ts` or `OrderService.ts` (pick one); components: `Counter.tsazor` |

Markup keeps Blazor's spelling: `<Button Appearance="…">` matches the TypeScript parameter
`appearance` (case-insensitively), so ported markup doesn't change.
