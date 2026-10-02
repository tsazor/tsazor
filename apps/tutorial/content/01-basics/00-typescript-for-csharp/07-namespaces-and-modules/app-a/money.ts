// A module: everything in this file is private to it unless it's exported.

export const VAT_RATE = 0.2;

const euros = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

function formatMoney(amount: number): string {
    return euros.format(amount);
}
