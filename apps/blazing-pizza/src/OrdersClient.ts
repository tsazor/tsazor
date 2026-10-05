/**
 * Port of BlazingPizza.Client/OrdersClient.cs — HTTP no longer goes through
 * app-owned TsazorHttp calls but through the PizzaApiClient generated from
 * api/openapi.json (@tsazor/dotnet, roadmap 5.2). Errors are HttpResult values
 * (ProblemDetails via problemMessage), no throw before the body is readable.
 * The vite dev proxy makes /specials, /toppings, /orders & /notifications
 * same-origin — hence relative paths without a baseUrl.
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