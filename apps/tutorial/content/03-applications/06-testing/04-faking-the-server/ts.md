---
title: Faking the server
keywords: vi.fn, fake fetch, mocking, TsazorHttp
focus: TodaysBread.test.ts
---

`TodaysBread` loads the breads from the server. Its test fakes the server with the `fetch`
option of `TsazorHttp`: the test's function answers instead of the network. Only the happy
case is tested. Add the failure: the server answers 503.

```ts
it("says so when the server fails", async () => {
    const fetch = vi.fn(async (_request: Request) => new Response("", { status: 503 }));
    const page = await render(TodaysBread, { services: server(fetch) });
    expect(page.find(".problem").textContent).toBe("The bakery's server didn't answer (503).");
});
```

`vi.fn` wraps the fake and records every call. Use that in the first test, to check that
the page asked the right address exactly once:

```ts
expect(fetch).toHaveBeenCalledTimes(1);
expect(fetch.mock.calls[0][0].url).toBe("https://bakery.example/api/breads");
```

No server runs, and nothing goes over the network, so the tests are fast and give the same
answer every time. The component doesn't know the difference: it injects `TsazorHttp`, and
the test registers one with a fake behind it.
