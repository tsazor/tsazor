/** A service token: any abstract or concrete class constructor. */
export type Token<T> = abstract new (...args: never[]) => T;

interface Registration {
  factory: (services: ServiceProvider) => unknown;
  singleton: boolean;
}

/** Blazor's IServiceCollection analogue: register factories, then build a provider. */
export class ServiceCollection {
  private readonly registrations = new Map<Token<never>, Registration>();

  register<T>(token: Token<T>, factory: (services: ServiceProvider) => T, options?: { singleton?: boolean }): this {
    this.registrations.set(token as unknown as Token<never>, { factory: factory as (s: ServiceProvider) => unknown, singleton: options?.singleton ?? true });
    return this;
  }

  /** Registers `type` so instances resolve via `new type(services)`. */
  registerType<T>(token: Token<T>, options?: { singleton?: boolean }): this {
    const ctor = token as unknown as abstract new (s: ServiceProvider) => T;
    return this.register(token as unknown as Token<never>, (s) => Reflect.construct(ctor as unknown as new (s: ServiceProvider) => T, [s]) as T, options);
  }

  /** Registers a constant value. */
  registerValue<T>(token: Token<T>, value: T): this {
    return this.register(token, () => value);
  }

  build(): ServiceProvider {
    return new ServiceProvider(new Map(this.registrations));
  }
}

/** Resolves services by token. Tokens are class constructors (identity-based). */
export class ServiceProvider {
  private readonly instances = new Map<Token<never>, unknown>();

  /** @internal Created via ServiceCollection.build(). */
  constructor(private readonly registrations: Map<Token<never>, Registration>) {}

  get<T>(token: Token<T>): T {
    const tokenAny = token as unknown as Token<never>;
    if (this.instances.has(tokenAny)) {
      return this.instances.get(tokenAny) as T;
    }
    const registration = this.registrations.get(tokenAny);
    if (!registration) {
      throw new Error(`Service not registered: ${describeToken(token)}`);
    }
    const instance = registration.factory(this);
    if (registration.singleton) {
      this.instances.set(tokenAny, instance);
    }
    return instance as T;
  }

  /** Like get, but returns undefined instead of throwing when unregistered. */
  tryGet<T>(token: Token<T>): T | undefined {
    const tokenAny = token as unknown as Token<never>;
    if (this.instances.has(tokenAny)) {
      return this.instances.get(tokenAny) as T;
    }
    const registration = this.registrations.get(tokenAny);
    if (!registration) return undefined;
    const instance = registration.factory(this);
    if (registration.singleton) {
      this.instances.set(tokenAny, instance);
    }
    return instance as T;
  }
}

function describeToken(token: Token<unknown>): string {
  const descriptor = Object.getOwnPropertyDescriptor(token, "name");
  return descriptor && typeof descriptor.value === "string" ? descriptor.value : String(token);
}