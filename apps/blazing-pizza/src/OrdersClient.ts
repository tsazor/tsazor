/**
 * Port of BlazingPizza.Client/OrdersClient.cs — HTTP läuft nicht mehr über
 * App-eigene TsazorHttp-Aufrufe, sondern über den aus api/openapi.json
 * generierten PizzaApiClient (@tsazor/dotnet, Roadmap 5.2). Fehler sind
 * HttpResult-Werte (ProblemDetails via problemMessage), kein throw, bevor der
 * Körper lesbar ist. Der vite-Dev-Proxy macht /specials, /toppings, /orders &
 * /notifications same-origin — deshalb relative Pfade ohne baseUrl.
 */
import type { HttpResult } from "@tsazor/dotnet";
import { TsazorHttp } from "@tsazor/runtime";
import type { Order, OrderWithStatus, PizzaSpecial, Topping } from "./models";
import { PizzaApiClient } from "./api/pizza-api";

export class OrdersClient {
  private readonly api = new PizzaApiClient(new TsazorHttp());

  getSpecials(): Promise<HttpResult<PizzaSpecial[]>> {
    return this.api.getSpecials();
  }

  getToppings(): Promise<HttpResult<Topping[]>> {
    return this.api.getToppings();
  }

  getOrders(): Promise<HttpResult<OrderWithStatus[]>> {
    return this.api.getOrders();
  }

  getOrder(orderId: number): Promise<HttpResult<OrderWithStatus>> {
    return this.api.getOrder(orderId);
  }

  /** Returns the new order's id as the posted int (HttpResult<number>). */
  placeOrder(order: Order): Promise<HttpResult<number>> {
    return this.api.placeOrder(order);
  }

  subscribeToNotifications(subscription: Record<string, unknown>): Promise<HttpResult<Record<string, unknown>>> {
    return this.api.subscribeToNotifications(subscription);
  }
}