/** What the bakery's ovens report: one event at a time, some with a longer message. */
export interface OvenEvent {
    id: number;
    oven: string;
    message: string;
}

const ovens = ["Oven 1", "Oven 2", "Stone oven"];
const messages = [
    "Sourdough in, 230 °C.",
    "Rye out, 24 loaves.",
    "Temperature dropped to 190 °C: the door was open for two minutes. Check the seal before the next batch.",
    "Pretzels in.",
    "Baguettes out, 40 pieces.",
];

let next = 1;

/** The next event the ovens send. */
export function nextEvent(): OvenEvent {
    const id = next++;
    return { id, oven: ovens[id % ovens.length]!, message: messages[id % messages.length]! };
}

/** The events since the shop opened. */
export function history(count: number): OvenEvent[] {
    return Array.from({ length: count }, () => nextEvent());
}
