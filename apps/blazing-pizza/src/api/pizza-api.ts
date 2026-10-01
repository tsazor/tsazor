// GENERATED CODE — nicht manuell editieren.

import type { LoginRequest, Order, OrderWithStatus, PizzaSpecial, RegisterRequest, Topping, UserEnvelope, UserInfo } from "./models";

import { OpenApiClient, type HttpResult } from "@tsazor/dotnet";
import { TsazorHttp } from "@tsazor/runtime";

export class PizzaApiClient extends OpenApiClient {
    constructor(http: TsazorHttp) {
        super(http);
    }

    /** Alle Specials für die Startseite. */
    getSpecials(): Promise<HttpResult<PizzaSpecial[]>> {
        return this.call("GET", `/specials`);
    }

    /** Alle Toppings, sortiert nach Name. */
    getToppings(): Promise<HttpResult<Topping[]>> {
        return this.call("GET", `/toppings`);
    }

    /** Die abgeschlossenen Bestellungen des aktuellen Users. */
    getOrders(): Promise<HttpResult<OrderWithStatus[]>> {
        return this.call("GET", `/orders`);
    }

    /** Speichert eine neue Bestellung und liefert deren Id. */
    placeOrder(body: Order): Promise<HttpResult<number>> {
        return this.call("POST", `/orders`, body);
    }

    /** Eine Bestellung mit Status und Live-Standorten (Poller-Futter). */
    getOrder(orderId: number): Promise<HttpResult<OrderWithStatus>> {
        return this.call("GET", `/orders/${encodeURIComponent(orderId)}`);
    }

    /** Registriert die Push-Subscription des Browsers (doppelte Rolle: SSE-Proxy). */
    subscribeToNotifications(body: Record<string, unknown>): Promise<HttpResult<Record<string, unknown>>> {
        return this.call("PUT", `/notifications/subscribe`, body);
    }

    /** Startet die Cookie-Session; 401 bei falschen Zugangsdaten. */
    login(body: LoginRequest): Promise<HttpResult<UserInfo>> {
        return this.call("POST", `/auth/login`, body);
    }

    /** Registriert den User (400 mit { error } bei Validierungsproblemen). */
    register(body: RegisterRequest): Promise<HttpResult<UserInfo>> {
        return this.call("POST", `/auth/register`, body);
    }

    /** Beendet die Cookie-Session. */
    logout(): Promise<HttpResult<void>> {
        return this.call("POST", `/auth/logout`);
    }

    /** Der aktuelle User als RemoteAuthenticator-Form ({ user: null } wenn anonym). */
    getCurrentUser(): Promise<HttpResult<UserEnvelope>> {
        return this.call("GET", `/auth/user`);
    }
}
