import type { TsazorHttp } from "@tsazor/runtime";

/** The order as the Blazor app's API returns it (Legacy/Orders.cs). */
export interface Order {
    id: number;
    customer: string;
    item: string;
    total: number;
    status: string;
}

/**
 * The client for the API boundary the migration drew around the Blazor app's OrderService.
 * Hand-written here to keep the sample small; with an OpenAPI document, `@tsazor/dotnet`
 * generates it (docs/migration.md).
 */
export class OrdersClient {
    constructor(private readonly http: TsazorHttp) {}

    getOrders(): Promise<Order[]> {
        return this.http.getJson<Order[]>("/api/orders");
    }

    getOrder(id: number): Promise<Order> {
        return this.http.getJson<Order>(`/api/orders/${id}`);
    }
}
