/**
 * The tutorial's test runner: the part of Vitest's API the testing lessons use
 * (`describe`, `it`/`test`, `beforeEach`/`afterEach`, `expect`, `vi.fn`), small
 * enough to run inside the preview. A lesson's `*.test.ts` imports it as
 * "vitest"; the same file is the type declaration the in-browser check serves
 * for "vitest", and the Node gate runs lessons with it. Self-contained: no
 * imports.
 */

type TestBody = () => void | Promise<void>;

interface TestCase {
  readonly name: string;
  readonly body: TestBody;
  readonly beforeEach: readonly TestBody[];
  readonly afterEach: readonly TestBody[];
}

/** The outcome of one test. */
export interface TestResult {
  /** "describe name > test name". */
  readonly name: string;
  readonly passed: boolean;
  /** The failure message (an expectation's, or the thrown error's). */
  readonly error?: string;
}

let tests: TestCase[] = [];
const scopes: { name: string; beforeEach: TestBody[]; afterEach: TestBody[] }[] = [{ name: "", beforeEach: [], afterEach: [] }];

/** Groups tests under a name; hooks registered inside apply to its tests only. */
export function describe(name: string, body: () => void): void {
  scopes.push({ name, beforeEach: [], afterEach: [] });
  try {
    body();
  } finally {
    scopes.pop();
  }
}

/** Registers a test. */
export function it(name: string, body: TestBody): void {
  tests.push({
    name: [...scopes.map((scope) => scope.name).filter(Boolean), name].join(" > "),
    body,
    beforeEach: scopes.flatMap((scope) => scope.beforeEach),
    afterEach: scopes.flatMap((scope) => scope.afterEach).reverse(),
  });
}

/** Another name for `it`. */
export const test = it;

/** Runs before each test of the enclosing `describe` (or of the file). */
export function beforeEach(body: TestBody): void {
  scopes[scopes.length - 1]!.beforeEach.push(body);
}

/** Runs after each test of the enclosing `describe` (or of the file). */
export function afterEach(body: TestBody): void {
  scopes[scopes.length - 1]!.afterEach.push(body);
}

/** Runs the registered tests in order and forgets them (the next run starts empty). */
export async function run(): Promise<TestResult[]> {
  const pending = tests;
  tests = [];
  scopes.splice(1);
  scopes[0]!.beforeEach.length = 0;
  scopes[0]!.afterEach.length = 0;
  const results: TestResult[] = [];
  for (const testCase of pending) {
    try {
      for (const hook of testCase.beforeEach) await hook();
      await testCase.body();
      for (const hook of testCase.afterEach) await hook();
      results.push({ name: testCase.name, passed: true });
    } catch (error) {
      results.push({ name: testCase.name, passed: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

/* Mocks ---------------------------------------------------------------------- */

/** A function that records its calls (Vitest's `vi.fn`). */
export interface Mock<TArgs extends unknown[] = unknown[], TResult = unknown> {
  (...args: TArgs): TResult;
  readonly mock: { readonly calls: TArgs[] };
}

export const vi = {
  /** A recording function; `implementation` decides what it returns. */
  fn<TArgs extends unknown[] = unknown[], TResult = undefined>(implementation?: (...args: TArgs) => TResult): Mock<TArgs, TResult> {
    const calls: TArgs[] = [];
    const mock = ((...args: TArgs) => {
      calls.push(args);
      return implementation?.(...args) as TResult;
    }) as Mock<TArgs, TResult>;
    Object.defineProperty(mock, "mock", { value: { calls } });
    return mock;
  },
};

/* Expectations --------------------------------------------------------------- */

export interface Assertion {
  /** The opposite of the next matcher. */
  readonly not: Assertion;
  /** Same value (`Object.is`). */
  toBe(expected: unknown): void;
  /** Same structure (deep equality). */
  toEqual(expected: unknown): void;
  /** A string contains the text, or an array the item. */
  toContain(expected: unknown): void;
  /** A string matches the pattern (or contains the text). */
  toMatch(expected: RegExp | string): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toBeDefined(): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  /** An array or string has this length. */
  toHaveLength(expected: number): void;
  toBeGreaterThan(expected: number): void;
  toBeLessThan(expected: number): void;
  toBeInstanceOf(expected: abstract new (...args: never[]) => unknown): void;
  /** The function throws (an error whose message contains `expected`, when given). */
  toThrow(expected?: string): void;
  /** The mock was called at least once. */
  toHaveBeenCalled(): void;
  /** The mock was called exactly `times` times. */
  toHaveBeenCalledTimes(times: number): void;
  /** Some call received these arguments (deep equality). */
  toHaveBeenCalledWith(...args: unknown[]): void;
}

const show = (value: unknown): string => {
  if (typeof value === "string") return `'${value}'`;
  if (typeof value === "function") return "[Function]";
  if (value instanceof Element) return `<${value.tagName.toLowerCase()}>`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b) || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((key) => equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

function isMock(value: unknown): value is Mock {
  return typeof value === "function" && "mock" in value;
}

/** Starts an expectation about `actual`. */
export function expect(actual: unknown): Assertion {
  return assertion(actual, false);
}

function assertion(actual: unknown, negated: boolean): Assertion {
  const check = (passed: boolean, message: string): void => {
    if (passed === negated) throw new Error(`expected ${show(actual)} ${negated ? "not " : ""}${message}`);
  };
  const calls = (): unknown[][] => {
    if (!isMock(actual)) throw new Error(`${show(actual)} is not a mock — create it with vi.fn()`);
    return actual.mock.calls;
  };
  return {
    get not() {
      return assertion(actual, !negated);
    },
    toBe: (expected) => check(Object.is(actual, expected), `to be ${show(expected)}`),
    toEqual: (expected) => check(equal(actual, expected), `to equal ${show(expected)}`),
    toContain: (expected) =>
      check(
        typeof actual === "string" ? actual.includes(String(expected)) : Array.isArray(actual) && actual.includes(expected),
        `to contain ${show(expected)}`,
      ),
    toMatch: (expected) =>
      check(typeof actual === "string" && (typeof expected === "string" ? actual.includes(expected) : expected.test(actual)), `to match ${String(expected)}`),
    toBeNull: () => check(actual === null, "to be null"),
    toBeUndefined: () => check(actual === undefined, "to be undefined"),
    toBeDefined: () => check(actual !== undefined, "to be defined"),
    toBeTruthy: () => check(Boolean(actual), "to be truthy"),
    toBeFalsy: () => check(!actual, "to be falsy"),
    toHaveLength: (expected) => check((actual as { length?: unknown } | null)?.length === expected, `to have length ${expected}`),
    toBeGreaterThan: (expected) => check(typeof actual === "number" && actual > expected, `to be greater than ${expected}`),
    toBeLessThan: (expected) => check(typeof actual === "number" && actual < expected, `to be less than ${expected}`),
    toBeInstanceOf: (expected) => check(actual instanceof expected, `to be an instance of ${expected.name}`),
    toThrow: (expected) => {
      let thrown: unknown;
      let didThrow = false;
      try {
        (actual as () => unknown)();
      } catch (error) {
        didThrow = true;
        thrown = error;
      }
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      check(didThrow && (expected === undefined || message.includes(expected)), expected === undefined ? "to throw" : `to throw ${show(expected)}`);
    },
    toHaveBeenCalled: () => check(calls().length > 0, "to have been called"),
    toHaveBeenCalledTimes: (times) => check(calls().length === times, `to have been called ${times} time(s), but it was called ${calls().length}`),
    toHaveBeenCalledWith: (...args) => check(calls().some((call) => equal(call, args)), `to have been called with ${show(args)}`),
  };
}
