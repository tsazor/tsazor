/**
 * Port of BlazingPizza.Client/OrderState.cs — the app-wide "current order"
 * state (Blazor: scoped DI service with events; Tsazor: singleton service,
 * components re-render because the handlers that mutate it are EventCallbacks
 * owned by those components).
 */
import { PIZZA_DEFAULT_SIZE, type Order, type Pizza, type PizzaSpecial, emptyOrder } from "./models";

export class OrderState {
  showingConfigureDialog = false;
  configuringPizza: Pizza | null = null;
  order: Order = emptyOrder();

  showConfigurePizzaDialog(special: PizzaSpecial): void {
    this.configuringPizza = {
      special,
      specialId: special.id,
      size: PIZZA_DEFAULT_SIZE,
      toppings: [],
    };
    this.showingConfigureDialog = true;
  }

  cancelConfigurePizzaDialog(): void {
    this.configuringPizza = null;
    this.showingConfigureDialog = false;
  }

  confirmConfigurePizzaDialog(): void {
    if (this.configuringPizza) {
      this.order.pizzas.push(this.configuringPizza);
      this.configuringPizza = null;
    }
    this.showingConfigureDialog = false;
  }

  removeConfiguredPizza(pizza: Pizza): void {
    this.order.pizzas = this.order.pizzas.filter((p) => p !== pizza);
  }

  resetOrder(): void {
    this.order = emptyOrder();
  }

  replaceOrder(order: Order): void {
    this.order = order;
  }
}

// @inject services are imported as default (codegen convention).
export default OrderState;