/**
 * Tsazor's DI (roadmap 3.8): Blazor's Microsoft.Extensions.DependencyInjection
 * analogue — singletons (one instance on the root provider), scoped services
 * (one instance per `createScope()` service scope, e.g. one per navigation
 * render) and transients (fresh per resolve, like Blazor's AddTransient).
 * Cycle detection reports .NET's exact message. Disposal follows .NET's
 * engine: instances a provider created are disposed in reverse creation order,
 * `registerValue` constants stay their owner's (an app-owned NavigationManager
 * would otherwise be disposed twice).
 */
import { serviceDefaultFor } from "./service-defaults.js";

/** A service key: the service's class (constructor), compared by identity — `@inject Cart cart` resolves `Cart`. */
export type Token<T> = abstract new (...args: never[]) => T;

/** Blazor's ServiceLifetime: AddSingleton / AddScoped / AddTransient. */
export type ServiceLifetime = "singleton" | "scoped" | "transient";

interface Registration {
  factory: (services: ServiceProvider) => unknown;
  lifetime: ServiceLifetime;
  /** A `registerValue` constant — the provider's dispose() leaves it to its owner. */
  constant?: boolean;
}

/** Blazor's IServiceCollection analogue: register factories, then build a provider. */
export class ServiceCollection {
  private readonly registrations = new Map<Token<never>, Registration>();

  /**
   * Blazor's AddSingleton/AddScoped/AddTransient with a factory: `factory`
   * runs against the resolving provider. The lifetime defaults to singleton
   * (`{ lifetime: "scoped" }`, `{ lifetime: "transient" }`). A second
   * registration for the same token replaces the first.
   */
  register<T>(token: Token<T>, factory: (services: ServiceProvider) => T, options?: { lifetime?: ServiceLifetime }): this {
    const lifetime = options?.lifetime ?? "singleton";
    this.registrations.set(token as unknown as Token<never>, { factory: factory as (s: ServiceProvider) => unknown, lifetime });
    return this;
  }

  /** Registers `type` so instances resolve via `new type(services)`. */
  registerType<T>(token: Token<T>, options?: { lifetime?: ServiceLifetime }): this {
    const ctor = token as unknown as abstract new (s: ServiceProvider) => T;
    return this.register(token as unknown as Token<never>, (s) => Reflect.construct(ctor as unknown as new (s: ServiceProvider) => T, [s]) as T, options);
  }

  /** Registers a constant value (its owner disposes it, not the provider). */
  registerValue<T>(token: Token<T>, value: T): this {
    this.registrations.set(token as unknown as Token<never>, { factory: () => value, lifetime: "singleton", constant: true });
    return this;
  }

  /** Blazor's BuildServiceProvider: creates the root provider from a snapshot of the registrations (later registrations do not affect it). */
  build(): ServiceProvider {
    return new ServiceProvider(new Map(this.registrations));
  }
}

/**
 * Resolves services by token. Tokens are class constructors (identity-based).
 * Built once via `ServiceCollection.build()`; service scopes derive from it
 * with `createScope()` and share the registrations.
 */
export class ServiceProvider {
  private readonly registrations: Map<Token<never>, Registration>;
  /** The provider that owns the singletons (undefined on the root itself). */
  private readonly root: ServiceProvider | undefined;
  private readonly instances = new Map<Token<never>, unknown>();
  /** Factory-created instances in creation order — dispose() reverses them. */
  private readonly tracked: { dispose(): void }[] = [];
  private disposed = false;

  /** @internal Created via ServiceCollection.build()/createScope(). */
  constructor(registrations: Map<Token<never>, Registration>, root?: ServiceProvider) {
    this.registrations = registrations;
    this.root = root;
  }

  /** Blazor's CreateScope: singletons resolve from the root, scoped once per scope. */
  createScope(): ServiceProvider {
    return new ServiceProvider(this.registrations, this.root ?? this);
  }

  /** Blazor's GetRequiredService: resolves `token` according to its lifetime; throws when it is unregistered, on a circular dependency or after `dispose`. */
  get<T>(token: Token<T>): T {
    return this.resolve(token, true) as T;
  }

  /** Like get, but returns undefined instead of throwing when unregistered. */
  tryGet<T>(token: Token<T>): T | undefined {
    return this.resolve(token, false) as T | undefined;
  }

  /**
   * Disposes the instances this provider created in reverse creation order: a
   * scope disposes its scoped (and directly resolved transient) services, the
   * root also its singletons. Constants are their owner's — never disposed here.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = this.tracked.length - 1; i >= 0; i--) {
      this.tracked[i]!.dispose();
    }
    this.instances.clear();
    this.tracked.length = 0;
  }

  private resolve(token: Token<unknown>, required: boolean): unknown {
    if (this.disposed) {
      throw new Error(`Cannot access a disposed object. Service provider: ${describeToken(token)}`);
    }
    const tokenAny = token as unknown as Token<never>;
    let registration = this.registrations.get(tokenAny);
    if (!registration) {
      // A service its defining module provides by default (service-defaults.ts):
      // registered on first use, a singleton of the root.
      const fallback = serviceDefaultFor(token as Token<unknown>);
      if (fallback) {
        registration = { factory: () => fallback(this.root ?? this), lifetime: "singleton" };
        this.registrations.set(tokenAny, registration);
      }
    }
    if (!registration) {
      if (required) {
        throw new Error(`Service not registered: ${describeToken(token)}`);
      }
      return undefined;
    }
    const owner: ServiceProvider | undefined =
      registration.lifetime === "singleton" ? (this.root ?? this) : registration.lifetime === "scoped" ? this : undefined;
    if (owner === undefined) {
      // Transient: a fresh instance per resolve, created against the caller's provider.
      const instance = this.construct(tokenAny, registration, this);
      if (isDisposable(instance)) {
        this.tracked.push(instance);
      }
      return instance;
    }
    const cached = owner.instances.get(tokenAny);
    if (cached !== undefined) {
      return cached;
    }
    const instance = owner.construct(tokenAny, registration, this);
    owner.instances.set(tokenAny, instance);
    if (!registration.constant && isDisposable(instance)) {
      owner.tracked.push(instance);
    }
    return instance;
  }

  /** Cycle-guarded construction: the factory runs against the requesting provider. */
  private construct(token: Token<never>, registration: Registration, requestedFrom: ServiceProvider): unknown {
    // .NET's CircularDependencyException — the factory chain re-entered this token.
    if (resolving.has(token)) {
      throw new Error(`A circular dependency was detected for the service of type '${describeToken(token)}'.`);
    }
    resolving.add(token);
    try {
      return registration.factory(requestedFrom);
    } finally {
      resolving.delete(token);
    }
  }
}

/**
 * The cycle guard for one synchronous resolution chain — construct() is sync,
 * so a module-level set is safe (nested resolutions belong to the same chain).
 */
const resolving = new Set<Token<never>>();

function isDisposable(instance: unknown): instance is { dispose(): void } {
  return typeof (instance as { dispose?: unknown } | null)?.dispose === "function";
}

function describeToken(token: Token<unknown>): string {
  const descriptor = Object.getOwnPropertyDescriptor(token, "name");
  return descriptor && typeof descriptor.value === "string" ? descriptor.value : String(token);
}