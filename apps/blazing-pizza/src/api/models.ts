// GENERATED CODE — do not edit by hand.
// Source: OpenAPI BlazingPizzaApi 1.0.0

import { EmailAddress, Required } from "@tsazor/runtime";

export class PizzaSpecial {
    id = 0;
    @Required()
    name = "";
    basePrice = 0;
    @Required()
    description = "";
    @Required()
    imageUrl = "";
}

export class Topping {
    id = 0;
    @Required()
    name = "";
    price = 0;
}

export class PizzaTopping {
    @Required()
    topping!: Topping;
    toppingId?: number;
    pizzaId?: number;
}

export class Pizza {
    id?: number;
    orderId?: number;
    @Required()
    special!: PizzaSpecial;
    specialId = 0;
    size = 0;
    toppings: PizzaTopping[] = [];
}

export class Address {
    id?: number;
    @Required()
    name = "";
    @Required()
    line1 = "";
    @Required()
    line2 = "";
    @Required()
    city = "";
    @Required()
    region = "";
    @Required()
    postalCode = "";
}

export class LatLong {
    latitude = 0;
    longitude = 0;
}

export class Marker {
    @Required()
    description = "";
    x = 0;
    y = 0;
    showPopup?: boolean;
}

export class Order {
    orderId?: number;
    userId?: string;
    /** Epoch milliseconds (new Date(...).getTime()) */
    createdTime?: number;
    @Required()
    deliveryAddress!: Address;
    deliveryLocation?: LatLong;
    pizzas: Pizza[] = [];
}

export class OrderWithStatus {
    @Required()
    order!: Order;
    @Required()
    statusText = "";
    mapMarkers: Marker[] = [];
}

export class UserInfo {
    @Required()
    userId = "";
    @Required()
    name = "";
    @Required()
    email = "";
}

export class UserEnvelope {
    user: UserInfo | null = null;
}

export class LoginRequest {
    @Required()
    @EmailAddress()
    email = "";
    @Required()
    password = "";
}

export class RegisterRequest {
    @Required()
    name = "";
    @Required()
    @EmailAddress()
    email = "";
    @Required()
    password = "";
}
