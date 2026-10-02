import { VAT_RATE } from "./money";

export interface InvoiceLine {
    label: string;
    amount: string;
}

export function invoice(net: number): InvoiceLine[] {
    const vat = net * VAT_RATE;
    return [
        { label: "Net", amount: String(net) },
        { label: "VAT", amount: String(vat) },
        { label: "Total", amount: String(net + vat) },
    ];
}
