export interface Named {
    name: string;
}

export class Customer implements Named {
    constructor(
        readonly name: string,
        readonly email: string,
    ) {}
}

export class Product {
    constructor(
        readonly name: string,
        readonly price: number,
    ) {}
}

/** C#: string Greet(INamed who) */
export function greet(who: Named): string {
    return `Hello, ${who.name}!`;
}

/** C#: T? Longest<T>(IEnumerable<T> items) where T : INamed */
export function longest<T extends Named>(items: readonly T[]): T | undefined {
    let best: T | undefined;
    for (const item of items) {
        if (best === undefined || item.name.length > best.name.length) best = item;
    }
    return best;
}

export const customer = new Customer("Ada", "ada@example.com");
export const product = new Product("Analytical Engine", 1843);

export const greetings: string[] = [
    greet(customer),
    greet(product),
    greet({ name: "Grace" }),
];
