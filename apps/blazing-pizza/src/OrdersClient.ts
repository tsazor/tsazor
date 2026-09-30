/**
 * Port of BlazingPizza.Client/OrdersClient.cs against TsazorHttp.
 * The vite dev proxy makes /specials, /toppings, /orders & /notifications
 * same-origin — exactly the workshop's configured HttpClient base.
 */
import { TsazorHttp } from "@tsazor/runtime";
import type { Order, OrderWithStatus, Topping } from "./models";

export class OrdersClient {
  private readonly http = new TsazorHttp();

  getToppings(): Promise<Topping[]> {
    return this.http.getJson<Topping[]>("/toppings");
  }

  getOrders(): Promise<OrderWithStatus[]> {
    return this.http.getJson<OrderWithStatus[]>("/orders");
  }

  getOrder(orderId: number): Promise<OrderWithStatus> {
    return this.http.getJson<OrderWithStatus>(`/orders/${orderId}`);
  }

  /** Returns the new order's id (the original posted and read an int). */
  async placeOrder(order: Order): Promise<number> {
    const result = await this.http.postJson<number | { orderId: number }>("/orders", order);
    return typeof result === "number" ? result : result.orderId;
  }

  subscribeToNotifications(subscription: unknown): Promise<unknown> {
    return this.http.putJson("/notifications/subscribe", subscription);
  }
}
