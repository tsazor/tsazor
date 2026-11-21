const euros = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

/** `3.2` → `€3.20` */
export function formatMoney(amount: number): string {
    return euros.format(amount);
}
