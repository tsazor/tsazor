// GENERATED CODE — do not edit by hand.

import type { LoginRequest, Order, OrderWithStatus, PizzaSpecial, RegisterRequest, Topping, UserEnvelope, UserInfo } from "./models";

import { OpenApiClient, type HttpResult, type RequestOptions } from "@tsazor/dotnet";
import { TsazorHttp } from "@tsazor/runtime";

export class PizzaApiClient extends OpenApiClient {
    constructor(http: TsazorHttp) {
        super(http);
    }

    /** All specials for the home page. */
    getSpecials(options?: RequestOptions): Promise<HttpResult<PizzaSpecial[]>> {
        return this.call("GET", `/specials`, undefined, options);
    }

    /** All toppings, sorted by name. */
    getToppings(options?: RequestOptions): Promise<HttpResult<Topping[]>> {
        return this.call("GET", `/toppings`, undefined, options);
    }

    /** The placed orders of the current user. */
    getOrders(options?: RequestOptions): Promise<HttpResult<OrderWithStatus[]>> {
        return this.call("GET", `/orders`, undefined, options);
    }

    /** Saves a new order and returns its id. */
    placeOrder(body: Order, options?: RequestOptions): Promise<HttpResult<number>> {
        return this.call("POST", `/orders`, body, options);
    }

    /** One order with status and live locations (fed to the poller). */
    getOrder(orderId: number, options?: RequestOptions): Promise<HttpResult<OrderWithStatus>> {
        return this.call("GET", `/orders/${encodeURIComponent(orderId)}`, undefined, options);
    }

    /** Registers the browser's push subscription (dual role: SSE proxy). */
    subscribeToNotifications(body: Record<string, unknown>, options?: RequestOptions): Promise<HttpResult<Record<string, unknown>>> {
        return this.call("PUT", `/notifications/subscribe`, body, options);
    }

    /** Starts the cookie session; 401 on wrong credentials. */
    login(body: LoginRequest, options?: RequestOptions): Promise<HttpResult<UserInfo>> {
        return this.call("POST", `/auth/login`, body, options);
    }

    /** Registers the user (400 with { error } on validation problems). */
    register(body: RegisterRequest, options?: RequestOptions): Promise<HttpResult<UserInfo>> {
        return this.call("POST", `/auth/register`, body, options);
    }

    /** Ends the cookie session. */
    logout(options?: RequestOptions): Promise<HttpResult<void>> {
        return this.call("POST", `/auth/logout`, undefined, options);
    }

    /** The current user in RemoteAuthenticator shape ({ user: null } when anonymous). */
    getCurrentUser(options?: RequestOptions): Promise<HttpResult<UserEnvelope>> {
        return this.call("GET", `/auth/user`, undefined, options);
    }
}
