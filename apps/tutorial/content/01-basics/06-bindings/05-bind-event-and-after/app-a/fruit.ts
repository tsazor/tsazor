const FRUIT = ["Apple", "Apricot", "Banana", "Blackberry", "Cherry", "Grape", "Lemon", "Mango", "Orange", "Peach", "Pear", "Plum"];

/** Searches "the server" — with a short delay, as a real request would have. */
export async function searchFruit(query: string): Promise<string[]> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const text = query.trim().toLowerCase();
    return text ? FRUIT.filter((fruit) => fruit.toLowerCase().includes(text)) : [];
}
