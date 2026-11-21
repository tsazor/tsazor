/** A row of the DataGrid demo. */
export interface GridOrder {
    id: number;
    customer: string;
    loaves: number;
    total: number;
    status: "open" | "shipped";
}
