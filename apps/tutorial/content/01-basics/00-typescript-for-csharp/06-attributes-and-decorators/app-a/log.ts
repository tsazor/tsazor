/** What the decorated methods have been called with. */
export const calls: string[] = [];

/**
 * A method decorator: runs once, when the class is defined, and returns
 * the function that replaces the method.
 */
export function logged<This, Args extends unknown[], Result>(
    method: (this: This, ...args: Args) => Result,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Result>,
) {
    const name = String(context.name);
    return function (this: This, ...args: Args): Result {
        const result = method.call(this, ...args);
        calls.push(`${name}(${args.join(", ")}) → ${String(result)}`);
        return result;
    };
}
