/**
 * A page as a content system would store it: a list of blocks, each with
 * a kind and its settings. (Imagine it came from an API.)
 */
export interface Block {
    kind: "heading" | "text" | "quote";
    props: Record<string, unknown>;
}

export const page: Block[] = [
    { kind: "heading", props: { text: "Welcome to the bakery" } },
    { kind: "text", props: { text: "Fresh bread every morning from six o'clock." } },
    { kind: "quote", props: { text: "Best croissants in town.", author: "A happy customer" } },
];
