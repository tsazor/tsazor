# @tsazor/primitives

Feel-at-home value types for .NET developers writing TypeScript: `Decimal`, `DateOnly`, `TimeOnly`,
`TimeSpan` and `Guid`. They fill real gaps in JavaScript without cloning the BCL — there are no
`List<T>`/LINQ wrappers here, because every TS library already expects real arrays and maps. The types
are immutable and zero-dependency, written in idiomatic TypeScript with recognizable .NET concepts.

See [`docs/design-extensions-primitives.md`](https://github.com/tsazor/tsazor/blob/main/docs/design-extensions-primitives.md) for the design
and decisions (X1–X4).

```ts
import { Decimal, DateOnly, TimeSpan, Guid } from "@tsazor/primitives";

const net = Decimal.from("19.99").mul(3).round(2);            // 59.97
net.format("de-DE", { style: "currency", currency: "EUR" });   // "59,97 €"

const due = DateOnly.parse("2026-01-31")!.addDays(1);          // "2026-02-01"
const span = TimeSpan.parse("1.02:03:04");                    // 1 day, 2h 3m 4s
const id = Guid.newGuid();
```

- **`Decimal`** — immutable arbitrary-precision base-10 number (BigInt scaled integer). `0.1 + 0.2`
  does not equal `0.3` in a `number`; `Decimal` does. Money, quantities, anything that must not drift.
  Arithmetic (`add`/`sub`/`mul`/`div`), `round` with .NET's `MidpointRounding` modes, invariant
  `toString`, culture `format` via `Intl`, `parse`.
- **`DateOnly` / `TimeOnly`** — a calendar date and a time-of-day without `Date`'s time-zone pitfalls.
  ISO `yyyy-MM-dd` / `HH:mm:ss`, `today`, `equals`/`compare`, `addDays`.
- **`TimeSpan`** — a duration. `fromMinutes`, `totalSeconds`, `add`, parses ISO-8601 durations and
  .NET's `"c"` format (`"1.02:03:04"`), renders `"c"`.
- **`Guid`** — a UUID. `newGuid()` (`crypto.randomUUID`), `parse`, `empty`, `equals`.

All five types serialize to a string on the wire (`toJSON`) — JSON numbers lose precision, so
`@tsazor/dotnet` reads and writes these as strings.
