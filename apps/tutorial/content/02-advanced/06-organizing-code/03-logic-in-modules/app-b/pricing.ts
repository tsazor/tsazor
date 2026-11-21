export interface Line {
    name: string;
    price: number;
    quantity: number;
}

export interface Totals {
    subtotal: number;
    discount: number;
    shipping: number;
    total: number;
}

const euros = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

export function formatMoney(amount: number): string {
    return euros.format(amount);
}

/** 10% off from €40, free shipping from €30 after the discount. */
export function totals(lines: readonly Line[]): Totals {
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const discount = subtotal >= 40 ? Math.round(subtotal * 10) / 100 : 0;
    const shipping = subtotal - discount >= 30 ? 0 : 4.9;
    return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}
