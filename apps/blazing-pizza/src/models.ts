/**
 * Blazing Pizza shared models — port of BlazingPizza.Shared as plain TS
 * interfaces + helper functions (TS has no C#-style extension methods).
 * Property casing matches the server contract (camelCase).
 */

/**
 * The wire shapes are DTO classes from the OpenAPI contract
 * (api/openapi.json, generated with tsazor-dotnet): one contract, one type
 * instead of duplicate interfaces. They are re-exported here under the domain
 * names; the helpers below work with the same types.
 */
export type {
  Address,
  LatLong,
  Marker,
  Order,
  OrderWithStatus,
  Pizza,
  PizzaSpecial,
  PizzaTopping,
  Topping,
} from "./api/models.js";
// A re-export does not bind the names locally; the helpers below need them.
import type { Address, LatLong, Order, Pizza, PizzaSpecial, PizzaTopping, Topping } from "./api/models.js";

export const PIZZA_DEFAULT_SIZE = 12;
export const PIZZA_MINIMUM_SIZE = 9;
export const PIZZA_MAXIMUM_SIZE = 17;

export function pizzaBasePrice(pizza: Pizza): number {
  return (pizza.size / PIZZA_DEFAULT_SIZE) * pizza.special.basePrice;
}

export function pizzaTotalPrice(pizza: Pizza): number {
  return pizzaBasePrice(pizza) + pizza.toppings.reduce((sum, pt) => sum + pt.topping.price, 0);
}

export function pizzaFormattedTotalPrice(pizza: Pizza): string {
  return pizzaTotalPrice(pizza).toFixed(2);
}

export function orderTotalPrice(order: Order): number {
  return order.pizzas.reduce((sum, pizza) => sum + pizzaTotalPrice(pizza), 0);
}

export function orderFormattedTotalPrice(order: Order): string {
  return orderTotalPrice(order).toFixed(2);
}

export function toppingFormattedPrice(topping: Topping): string {
  return topping.price.toFixed(2);
}

export function specialFormattedBasePrice(special: PizzaSpecial): string {
  return special.basePrice.toFixed(2);
}

/** DateTime.ToLongDateString (invariant en-US) for createdTime values. */
export function formatLongDate(createdTime: number | undefined): string {
  if (!createdTime) return "";
  return new Date(createdTime).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function emptyAddress(): Address {
  return { name: "", line1: "", line2: "", city: "", region: "", postalCode: "" };
}

export function emptyOrder(): Order {
  return { deliveryAddress: emptyAddress(), pizzas: [] };
}

export function interpolateLatLong(start: LatLong, end: LatLong, proportion: number): LatLong {
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * proportion,
    longitude: start.longitude + (end.longitude - start.longitude) * proportion,
  };
}