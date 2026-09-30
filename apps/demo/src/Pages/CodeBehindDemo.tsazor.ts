/**
 * Code-behind for CodeBehindDemo.tsazor: the generated component class
 * extends this class's default export (the file's own base class chain).
 * Markup renders `@count`, `@doubleCount` and `@greetingMessage` through the
 * inheritance — everything defined here, the .tsazor markup can reference.
 */
import { ComponentBase } from "@tsazor/runtime";

export default class CodeBehindDemo extends ComponentBase {
    count = 0;
    loadedAt = "";

    protected override onInitialized(): void {
        this.loadedAt = new Date().toLocaleTimeString();
    }

    get doubleCount(): number {
        return this.count * 2;
    }

    get greetingMessage(): string {
        return `Code-behind state: count=${this.count}${this.loadedAt ? ` (initialized at ${this.loadedAt})` : ""}`;
    }

    increment(): void {
        this.count++;
    }
}