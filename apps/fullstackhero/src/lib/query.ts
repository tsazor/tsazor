import {
  hashKey,
  QueryObserver,
  type DefaultError,
  type QueryClient,
  type QueryKey,
  type QueryObserverOptions,
  type QueryObserverResult,
} from "@tanstack/query-core";
import { queryClient } from "@/lib/query-client";

/**
 * React Query's `useQuery`, for a Tsazor component: TanStack Query's core is framework-free, and its QueryObserver
 * is what `useQuery` wraps. The component observes the query (Tsazor's `observe` takes anything with `subscribe`),
 * which starts it and re-renders the component on every change:
 *
 * ```razor
 * @code {
 *     private readonly users = new Query(() => ({ queryKey: ["users", this.page], queryFn: () => searchUsers(this.page) }));
 *     protected override onInitialized() { this.observe(this.users); }
 * }
 * <p>@users.result.data?.totalCount</p>
 * ```
 *
 * The options are a function, read on every render as `useQuery` reads its argument: a changed key (`this.page`)
 * switches the observer to that query, `placeholderData: keepPreviousData` keeps the last page meanwhile.
 * (port-fullstackhero.md: TanStack Query.)
 */
export class Query<TQueryFnData = unknown, TError = DefaultError, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey> {
  private readonly observer: QueryObserver<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>;
  private applied: string;

  constructor(
    private readonly options: () => QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>,
    private readonly client: QueryClient = queryClient,
  ) {
    const defaulted = this.defaulted();
    this.observer = new QueryObserver(client, defaulted);
    this.applied = Query.identity(defaulted);
  }

  /**
   * The query's state for the current options — `useQuery`'s return value. Before the first fetch has started it
   * already reports the fetch it will make (`isLoading`), as `useQuery` does on its first render.
   */
  get result(): QueryObserverResult<TData, TError> {
    const defaulted = this.defaulted();
    const identity = Query.identity(defaulted);
    if (identity !== this.applied) {
      this.applied = identity;
      this.observer.setOptions(defaulted);
    }
    return this.observer.getOptimisticResult(defaulted);
  }

  /**
   * The observer's subscription — what `observe` calls: the first subscriber starts the query. With the options of
   * now: a Query made in a field initializer saw the component before its parameters were set (a key with an empty
   * id), and starting with those would fetch a query nobody reads.
   */
  subscribe(listener: (result: QueryObserverResult<TData, TError>) => void): () => void {
    void this.result;
    return this.observer.subscribe(listener);
  }

  /** `refetch()` of `useQuery`'s result. */
  refetch(): Promise<QueryObserverResult<TData, TError>> {
    return this.observer.refetch();
  }

  private defaulted() {
    const options = this.client.defaultQueryOptions(this.options());
    // What useQuery sets: the result reports a fetch the observer will start on its first subscriber.
    options._optimisticResults = "optimistic";
    return options;
  }

  /** What makes the observer change queries: the key, and whether it may run. */
  private static identity(options: { queryHash?: string; queryKey: QueryKey; enabled?: unknown }): string {
    return `${options.queryHash ?? hashKey(options.queryKey)}|${typeof options.enabled === "function" ? "fn" : String(options.enabled ?? true)}`;
  }
}
