---
title: Faking the server
keywords: vi.fn, fake fetch, mocking, TsazorHttp
focus: TodaysBread.test.ts
---

Add a test for a failing server, a fake that answers 503:

```ts
const fetch = vi.fn(async (_request: Request) => new Response("", { status: 503 }));
const page = await render(TodaysBread, { services: server(fetch) });
expect(page.find(".problem").textContent).toBe("The bakery's server didn't answer (503).");
```

In the first test, check the request: `expect(fetch).toHaveBeenCalledTimes(1)` and
`fetch.mock.calls[0][0].url`.

> **Coming from Blazor:** in bUnit you'd mock the `HttpMessageHandler` (or use a library
> like RichardSzalay.MockHttp). Here the handler is one function, `fetch`, passed to the
> `TsazorHttp` you register. `vi.fn` records its calls, much like Moq's `Verify`.
