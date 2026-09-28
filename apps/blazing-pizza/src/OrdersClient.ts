/**
 * Port of BlazingPizza.Client/OrdersClient.cs against TasorHttp.
 * The vite dev proxy makes /specials, /toppings, /orders & /notifications
 * same-origin — exactly the workshop's configured HttpClient base.
 */
import { TasorHttp } from "@tasor/runtime";
import type { Order, OrderWithStatus, Topping } from "./models";

export class OrdersClient {
  private readonly http = new TasorHttp();

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

// @inject services are imported as default (codegen convention).
export default OrdersClient;