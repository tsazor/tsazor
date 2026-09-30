/**
 * Shared base for all Blazing Pizza pages/components — carries the model
 * formatting helpers so markup can call them as members (C# had
 * GetFormattedTotalPrice() as a model extension; TS markup bakes bare
 * identifiers to this.*, so helpers must live on the component).
 */
import { ComponentBase } from "@tsazor/runtime";
import {
  formatLongDate,
  orderFormattedTotalPrice,
  pizzaFormattedTotalPrice,
  specialFormattedBasePrice,
  toppingFormattedPrice,
} from "./models";

export default class PizzaComponentBase extends ComponentBase {
  protected readonly formatLongDate = formatLongDate;
  protected readonly orderFormattedTotalPrice = orderFormattedTotalPrice;
  protected readonly pizzaFormattedTotalPrice = pizzaFormattedTotalPrice;
  protected readonly specialFormattedBasePrice = specialFormattedBasePrice;
  protected readonly toppingFormattedPrice = toppingFormattedPrice;
}