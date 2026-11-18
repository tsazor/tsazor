# Live data: server events through `observe`

A page that shows what happens on the server as it happens — orders coming in, a batch job's progress, a
dashboard — subscribes to a stream and renders each event. In Tsazor the subscription belongs to the component:
`this.observe(source, onNext)` subscribes, renders on every notification, and unsubscribes when the component is
disposed ([design-bindable-observe.md](design-bindable-observe.md), §2). This guide connects it to server-sent
events (`EventSource`) and draws them in a live chart. `apps/skins` runs it (`/charts`, "Live data"), and its gate
checks it in Edge, Firefox and WebKit across dropped connections.

If you come from Blazor Server: there the circuit itself is the live channel, and a service raises a C# event that
the component handles with `InvokeAsync(StateHasChanged)`. In the browser the channel is explicit. Tsazor chooses
server-sent events for one-way streams because the browser reconnects by itself and resumes where it left off,
with nothing but HTTP on the server; for both directions take a WebSocket or SignalR's JavaScript client, through
the same `observe`.

## The source

`observe` takes anything with `subscribe(listener) → () => void`. An `EventSource` becomes one in a few lines
(`apps/skins/src/server-events.ts`):

```ts
export function serverEvents<T>(url: string, onState?: (state: StreamState) => void) {
  return {
    subscribe(listener: (value: T) => void): () => void {
      const source = new EventSource(url);
      source.addEventListener("open", () => onState?.("open"));
      // CONNECTING after an error: the browser is retrying; CLOSED: it gave up.
      source.addEventListener("error", () => onState?.(source.readyState === EventSource.CONNECTING ? "reconnecting" : "closed"));
      source.addEventListener("message", (event) => listener(JSON.parse(event.data) as T));
      return () => source.close();
    },
  };
}
```

## The page

```razor
<p>Stream: @stream. Orders today: @orders.</p>

@code {
    private stream: StreamState = "connecting";
    private orders = 0;

    protected override onInitialized(): void {
        this.observe(serverEvents<OrderEvent>("/api/events", (state) => {
            this.stream = state;
            this.stateHasChanged(); // not an event of the page: render it yourself
        }), (event) => {
            this.orders = event.total; // observe renders after onNext
        });
    }
}
```

- **One subscription per component.** Observe in `onInitialized`. Observing the same source again opens a second
  stream; `observe` returns a function that ends one early.
- **Bursts render once.** Events that arrive in one tick become one render.
- **Leaving the page closes the stream.** The component is disposed, `observe` calls the source's cleanup, and
  `source.close()` ends the connection. No `dispose()` of your own.
- **The state callback** isn't a notification of the source, so it calls `stateHasChanged()` itself.

## Reconnecting without losing events

A connection drops: a proxy's timeout, a deploy, the laptop's lid. `EventSource` reconnects by itself after the
server's `retry:` (or a few seconds), and it sends the id of the last event it saw in the `Last-Event-ID` header.
A server that numbers its events resumes from the next one, so the page misses nothing and sees nothing twice:

```text
retry: 1000

id: 41
data: {"total":41}

id: 42
data: {"total":42}
```

In ASP.NET Core (.NET 10's `TypedResults.ServerSentEvents`, or by hand):

```csharp
app.MapGet("/api/events", (HttpRequest request, OrderFeed feed, CancellationToken cancel) =>
{
    long.TryParse(request.Headers["Last-Event-ID"], out var lastId);
    return TypedResults.ServerSentEvents(feed.Since(lastId, cancel)); // SseItem<T> with EventId set
});
```

- **Number the events** on the server (`id:`), from something that survives a restart if the stream must too (an
  order number, a sequence, a timestamp).
- **Answer `Last-Event-ID`** with the events after it. Without ids, a reconnect starts the stream over.
- **Tell the user.** `reconnecting` is worth a quiet note ("Reconnecting…"); `closed` means the server refused the
  stream (a 4xx, the wrong content type) and the browser won't retry: offer a way to try again.
- **Authentication** goes with the cookie (same origin, or `new EventSource(url, { withCredentials: true })`).
  `EventSource` can't send an `Authorization` header; behind a bearer token, put a short-lived token in the query
  string or use `fetch` with a stream reader.
- **HTTP/1.1** allows six connections per origin, and each open stream takes one. Over HTTP/2 they share one.

The skins app's endpoint (`apps/skins/scripts/events-endpoint.mjs`) ends every connection after five events on
purpose; the gate waits for twelve and checks that the readings it shows are numbered without a gap or a repeat.

## One job's progress: history, live, done

A page shows one long-running job (`/jobs/42`). The server streams its events — a late subscriber gets the history
first, then the live ones — numbers each, and completes the stream when the job is done. Three things the page needs:
drop the events it has seen (a resubscribe replays them), know when the stream ended, and then load the final state
once. `sequenced` does the first, `observe`'s `complete` the second:

```razor
@page "/jobs/{jobId}"
@import { sequenced } from "@tsazor/runtime"
@inject JobsApi Jobs

<p>@(this.done ? "Done" : "Running…") — @this.events.length steps</p>

@code {
    @Parameter() jobId = "";
    private events: JobEvent[] = [];
    private done = false;
    private result?: JobResult;

    protected override onInitialized(): void {
        const progress = sequenced(this.Jobs.progress(this.jobId), (event) => event.seq);
        this.observe(progress, {
            next: (event) => { this.events = [...this.events, event]; },
            complete: async () => { this.done = true; this.result = await this.Jobs.result(this.jobId); },
        });
    }
}
```

- `sequenced` drops a number it has seen; it doesn't fill a gap. The server's replay does: a resubscribe gets the
  history again, and the duplicates fall away. A page that loaded the events up to 17 first starts after it:
  `sequenced(source, seqOf, 17)`.
- `complete` re-renders the page, and an async one again when it's done; its rejection reaches the nearest
  ErrorBoundary, as `onNext`'s errors do.
- The same works for SignalR (a `HubConnection.stream` is subscribable), a WebSocket wrapped in a subscribable, or
  Sleipnir's generated client (`apps/sleipnir-ticker`'s jobs page).

## Into a chart

A dashboard shows the last minutes as a line that moves on. The page keeps the window, and each event updates the
chart in place ([guide-charts.md](guide-charts.md), the chart through `@attach`):

```razor
<canvas role="img" aria-label="@ovenSummary" @attach="oven.attach"></canvas>

@code {
    private readings: Reading[] = [];
    private readonly oven = new SeriesChart(this.ovenSeries, { type: "line", live: true });

    protected override onInitialized(): void {
        this.observe(serverEvents<Reading>("/api/events"), (reading) => {
            this.readings = [...this.readings, reading].slice(-20); // the last 20
            this.oven.update(this.ovenSeries);
        });
    }

    private get ovenSeries(): Series {
        return { label: "Oven temperature, °C", labels: this.readings.map((r) => String(r.id)), values: this.readings.map((r) => r.celsius) };
    }
}
```

- **Keep a window.** A stream doesn't end; `slice(-20)` keeps the page's memory and the chart's width fixed.
- **Draw at once.** `chart.update("none")` for each event: an animation from the last values slides the line
  sideways, several times a second.
- **The same data for everyone.** The text alternative (`ovenSummary`: "from 222 to 238 °C, now 228 °C") and the
  table next to the chart come from `readings` too, and `observe` renders them with each event.
- **Fit the axis.** A line that follows a value takes its axis from the data (`beginAtZero: false`); bars that
  compare start at zero.

## Other sources, the same pattern

- **A WebSocket:** `subscribe` opens it, `message` calls the listener, the cleanup closes it. Reconnecting and
  resuming are yours to write.
- **SignalR's JavaScript client** (`@microsoft/signalr`): `connection.on("OrderPlaced", listener)` in `subscribe`,
  `connection.off(…)` in the cleanup; `withAutomaticReconnect()` reconnects, and the hub resends what was missed if
  you build it to.
- **A store or an RxJS observable** works as it is: `observe` takes `subscribe → { unsubscribe() }` too.
