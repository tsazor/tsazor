import { MaxLength, Range, Required } from "@tsazor/runtime";

/** The pre-order form's model — the validation rules live here, on the fields. */
export class BreadOrder {
    @Required() @MaxLength(40)
    name = "";

    @Range(1, 10)
    quantity = 1;

    bread = "sourdough";
    pickup = true;
}