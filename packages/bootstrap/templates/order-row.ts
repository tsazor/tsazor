/** The page's order rows (the grid's items); the app's to extend. */
export class OrderRow {
  constructor(
    public readonly id: number,
    public customer: string,
    public total: number,
    public paid: boolean,
  ) {}
}

/** The dialog's form fields, as the rules validate them. */
import { Range, Required } from "@tsazor/runtime";

export class OrderForm {
  @Required() customer: string | null = null;
  @Required() @Range(0, 1000000) total: number | null = null;

  constructor(customer?: string, total?: number) {
    this.customer = customer ?? null;
    this.total = total ?? null;
  }
}