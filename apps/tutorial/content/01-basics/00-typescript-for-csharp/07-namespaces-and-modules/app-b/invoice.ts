import { VAT_RATE, formatMoney } from "./money";

export interface InvoiceLine {
    label: string;
    amount: string;
}

export function invoice(net: number): InvoiceLine[] {
    const vat = net * VAT_RATE;
    return [
        { label: "Net", amount: formatMoney(net) },
        { label: "VAT", amount: formatMoney(vat) },
        { label: "Total", amount: formatMoney(net + vat) },
    ];
}
