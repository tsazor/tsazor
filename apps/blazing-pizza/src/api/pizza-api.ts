// GENERATED CODE — do not edit by hand.

import type { LoginRequest, Order, OrderWithStatus, PizzaSpecial, RegisterRequest, Topping, UserEnvelope, UserInfo } from "./models";

import { OpenApiClient, type HttpResult } from "@tsazor/dotnet";
import { TsazorHttp } from "@tsazor/runtime";

export class PizzaApiClient extends OpenApiClient {
    constructor(http: TsazorHttp) {
        super(http);
    }

    /** All specials for the home page. */
    getSpecials(): Promise<HttpResult<PizzaSpecial[]>> {
        return this.call("GET", `/specials`);
    }

    /** All toppings, sorted by name. */
    getToppings(): Promise<HttpResult<Topping[]>> {
        return this.call("GET", `/toppings`);
    }

    /** The placed orders of the current user. */
    getOrders(): Promise<HttpResult<OrderWithStatus[]>> {
        return this.call("GET", `/orders`);
    }

    /** Saves a new order and returns its id. */
    placeOrder(body: Order): Promise<HttpResult<number>> {
        return this.call("POST", `/orders`, body);
    }

    /** One order with status and live locations (fed to the poller). */
    getOrder(orderId: number): Promise<HttpResult<OrderWithStatus>> {
        return this.call("GET", `/orders/${encodeURIComponent(orderId)}`);
    }

    /** Registers the browser's push subscription (dual role: SSE proxy). */
    subscribeToNotifications(body: Record<string, unknown>): Promise<HttpResult<Record<string, unknown>>> {
        return this.call("PUT", `/notifications/subscribe`, body);
    }

    /** Starts the cookie session; 401 on wrong credentials. */
    login(body: LoginRequest): Promise<HttpResult<UserInfo>> {
        return this.call("POST", `/auth/login`, body);
    }

    /** Registers the user (400 with { error } on validation problems). */
    register(body: RegisterRequest): Promise<HttpResult<UserInfo>> {
        return this.call("POST", `/auth/register`, body);
    }

    /** Ends the cookie session. */
    logout(): Promise<HttpResult<void>> {
        return this.call("POST", `/auth/logout`);
    }

    /** The current user in RemoteAuthenticator shape ({ user: null } when anonymous). */
    getCurrentUser(): Promise<HttpResult<UserEnvelope>> {
        return this.call("GET", `/auth/user`);
    }
}
