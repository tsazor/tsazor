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
    static fromJson(data: unknown): Order { return data as Order; }
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
    static fromJson(data: unknown): NewOrder { return data as NewOrder; }
}

export class ProblemDetails {
    type?: string | null;
    title?: string | null;
    status?: number | null;
    detail?: string | null;
    static fromJson(data: unknown): ProblemDetails { return data as ProblemDetails; }
}
