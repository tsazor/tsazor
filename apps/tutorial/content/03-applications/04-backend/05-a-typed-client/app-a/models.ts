// GENERATED CODE — do not edit by hand.
// Source: OpenAPI Bakery v1

import { MaxLength, Range, Required } from "@tsazor/runtime";

export class Order {
    id = 0;
    @Required()
    customer = "";
    @Required()
    bread = "";
    quantity = 0;
    @Required()
    state!: "open" | "picked-up";
}

export class NewOrder {
    @Required()
    @MaxLength(40)
    name = "";
    @Required()
    bread = "";
    @Range(1, 10)
    quantity = 0;
    pickup?: boolean;
}

export class ProblemDetails {
    type?: string | null;
    title?: string | null;
    status?: number | null;
    detail?: string | null;
}
