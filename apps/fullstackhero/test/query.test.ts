/**
 * lib/query.ts — `useQuery` for a Tsazor component: the observer's result for the current options, the fetch it
 * will make reported before it starts, a changed key switching queries (keepPreviousData keeping the last page).
 */
import { describe, expect, it } from "vitest";
import { keepPreviousData, QueryClient } from "@tanstack/query-core";
import { Query } from "@/lib/query";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Query", () => {
  it("reports the coming fetch, fetches on the first subscriber, and notifies with the data", async () => {
    const client = new QueryClient();
    const calls: number[] = [];
    const query = new Query(() => ({ queryKey: ["n"], queryFn: async () => (calls.push(1), 42) }), client);
    // Before anyone subscribes: useQuery's first render already says "loading".
    expect(query.result.isLoading).toBe(true);
    expect(calls).toEqual([]);
    const seen: Array<number | undefined> = [];
    const stop = query.subscribe((result) => seen.push(result.data));
    await tick();
    await tick();
    expect(calls).toEqual([1]);
    expect(query.result.data).toBe(42);
    expect(seen.at(-1)).toBe(42);
    stop();
  });

  it("switches to the query of a changed key, keeping the previous page meanwhile", async () => {
    const client = new QueryClient();
    let page = 1;
    const query = new Query(
      () => ({ queryKey: ["page", page], queryFn: async () => `page ${page}`, placeholderData: keepPreviousData }),
      client,
    );
    const stop = query.subscribe(() => {});
    await tick();
    await tick();
    expect(query.result.data).toBe("page 1");
    page = 2;
    const switched = query.result;
    expect(switched.data).toBe("page 1");
    expect(switched.isPlaceholderData).toBe(true);
    await tick();
    await tick();
    expect(query.result.data).toBe("page 2");
    expect(query.result.isPlaceholderData).toBe(false);
    stop();
  });

  it("doesn't run while `enabled` is false, and runs when it turns true", async () => {
    const client = new QueryClient();
    let open = false;
    let calls = 0;
    const query = new Query(() => ({ queryKey: ["recent"], queryFn: async () => ++calls, enabled: open }), client);
    const stop = query.subscribe(() => {});
    await tick();
    expect(calls).toBe(0);
    open = true;
    void query.result;
    await tick();
    await tick();
    expect(calls).toBe(1);
    expect(query.result.data).toBe(1);
    stop();
  });
});
