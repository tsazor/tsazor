import { Required } from "@tsazor/runtime";

/** The pre-order form's model. */
export class Reservation {
    @Required()
    name = "";
}
