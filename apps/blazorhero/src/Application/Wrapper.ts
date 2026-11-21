// BlazorHero.Shared's Wrapper: every API answer is a Result (HTTP 200 for a failure too, `succeeded: false`).

/** Shared/Wrapper/Result.cs: messages for the snackbar — on success too ("Product Saved"). */
export interface Result {
    readonly messages: string[];
    readonly succeeded: boolean;
}

/** Shared/Wrapper/Result<T>: a Result with its data. */
export interface ResultOf<TData> extends Result {
    readonly data: TData;
}

/** Shared/Wrapper/PaginatedResult.cs: a page of a server-paged list. */
export interface PaginatedResult<TData> extends Result {
    readonly data: TData[];
    readonly currentPage: number;
    readonly totalPages: number;
    readonly totalCount: number;
    readonly pageSize: number;
    readonly hasPreviousPage: boolean;
    readonly hasNextPage: boolean;
}

/** Result.Success / Result.Fail, for results the client makes itself. */
export const results = {
    success(...messages: string[]): Result {
        return { succeeded: true, messages };
    },
    fail(...messages: string[]): Result {
        return { succeeded: false, messages };
    },
};
