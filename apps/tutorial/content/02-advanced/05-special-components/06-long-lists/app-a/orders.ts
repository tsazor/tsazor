/** The bakery's order history: 10,000 orders, every seventh with a note. */
export interface Order {
    id: number;
    customer: string;
    items: string;
    note?: string;
}

const customers = ["Marta", "Jonas", "Bea", "Omar", "Lena", "Yusuf", "Ida"];
const baskets = ["2 × Sourdough", "Rye, 4 × Pretzel", "Croissant", "3 × Baguette, Rye", "Cinnamon roll"];
const notes = ["Slice the bread, please.", "Pick-up at 7 a.m. — the shop opens at 8, ring the bell at the back door.", "Gluten-free if you have it."];

export const orders: Order[] = Array.from({ length: 10_000 }, (_, i) => ({
    id: i + 1,
    customer: customers[i % customers.length]!,
    items: baskets[i % baskets.length]!,
    note: i % 7 === 6 ? notes[i % notes.length] : undefined,
}));
