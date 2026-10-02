import { logged } from "./log";

export class Calculator {
    @logged
    add(a: number, b: number): number {
        return a + b;
    }

    @logged
    multiply(a: number, b: number): number {
        return a * b;
    }
}
