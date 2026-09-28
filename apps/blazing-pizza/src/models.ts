/**
 * Blazing Pizza shared models — port of BlazingPizza.Shared as plain TS
 * interfaces + helper functions (TS has no C#-style extension methods).
 * Property casing matches the server contract (camelCase).
 */

export interface PizzaSpecial {
  id: number;
  name: string;
  basePrice: number;
  description: string;
  imageUrl: string;
}

export interface Topping {
  id: number;
  name: string;
  price: number;
}

export interface PizzaTopping {
  topping: Topping;
  toppingId?: number;
  pizzaId?: number;
}

export interface Pizza {
  id?: number;
  orderId?: number;
  special: PizzaSpecial;
  specialId: number;
  size: number;
  toppings: PizzaTopping[];
}

export interface Address {
  id?: number;
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
}

export interface LatLong {
  latitude: number;
  longitude: number;
}

/** Marker for the delivery map (ComponentsLibrary/Map/Marker.cs). */
export interface Marker {
  description: string;
  x: number;
  y: number;
  showPopup?: boolean;
}

export interface Order {
  orderId?: number;
  userId?: string;
  createdTime?: number;
  deliveryAddress: Address;
  deliveryLocation?: LatLong;
  pizzas: Pizza[];
}

export interface OrderWithStatus {
  order: Order;
  statusText: string;
  mapMarkers: Marker[];
}

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