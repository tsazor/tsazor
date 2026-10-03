// GENERATED CODE — do not edit by hand.

import type { NewOrder, Order } from "./models";

import { OpenApiClient, queryString, type HttpResult } from "@tsazor/dotnet";
import { TsazorHttp } from "@tsazor/runtime";

/** Query parameters of the getOrders operation. */
export type GetOrdersQuery = {
    state?: "open" | "picked-up";
};

export class BakeryClient extends OpenApiClient {
    constructor(http: TsazorHttp) {
        super(http);
    }

    getOrders(query?: GetOrdersQuery): Promise<HttpResult<Order[]>> {
        return this.call("GET", `/api/orders${queryString(query)}`);
    }

    createOrder(body: NewOrder): Promise<HttpResult<Order>> {
        return this.call("POST", `/api/orders`, body);
    }
}
