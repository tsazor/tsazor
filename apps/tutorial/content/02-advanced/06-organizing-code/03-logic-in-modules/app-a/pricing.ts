export interface Line {
    name: string;
    price: number;
    quantity: number;
}

const euros = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

export function formatMoney(amount: number): string {
    return euros.format(amount);
}
