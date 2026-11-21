/** An order as the server sends it (JSON). */
export interface Order {
    id: number;
    customer: string;
    bread: string;
    quantity: number;
    state: "open" | "picked-up";
}
