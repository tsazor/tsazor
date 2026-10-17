/**
 * DI (roadmap 3.8): ServiceLifetime semantics over scopes — singleton on the
 * root, scoped once per `createScope()`, transient fresh per resolve — plus
 * cycle detection (.NET's message) and dispose order (reverse creation,
 * constants untouched).
 */
import { describe, expect, it } from "vitest";
import { ServiceCollection, ServiceProvider } from "../src/di/service-collection";

class Clock {
  ticks = 0;
}

/** Logs its lifecycle into a shared journal — dispose order's evidence. */
class Logger {
  constructor(private readonly journal: string[]) {
    this.journal.push("Logger");
  }
  dispose(): void {
    this.journal.push("Logger disposed");
  }
}

class Session {
  disposed = false;
  constructor(private readonly journal: string[]) {
    this.journal.push("Session");
  }
  dispose(): void {
    this.disposed = true;
    this.journal.push("Session disposed");
  }
}

/* Mutual dependency pair — the cycle test's input. */
class A {
  constructor(readonly b: B) {}
}
class B {
  constructor(readonly a: A) {}
}

describe("lifetimes", () => {
  it("caches singletons on the root, one instance across scopes", () => {
    const root = new ServiceCollection().register(Clock, () => new Clock()).build();
    const scope = root.createScope();
    const nested = scope.createScope();
    expect(scope.get(Clock)).toBe(root.get(Clock));
    expect(nested.get(Clock)).toBe(root.get(Clock));
  });

  it("caches scoped services per scope, shared with nothing else", () => {
    const root = new ServiceCollection().register(Clock, () => new Clock(), { lifetime: "scoped" }).build();
    const first = root.createScope();
    const second = root.createScope();
    expect(first.get(Clock)).not.toBe(second.get(Clock));
    expect(first.get(Clock)).toBe(first.get(Clock));
    // The root itself is its own scope for scoped registrations.
    expect(root.get(Clock)).not.toBe(first.get(Clock));
  });

  it("creates transients fresh per resolve, against the requesting provider", () => {
    const collection = new ServiceCollection();
    collection.register(Session, () => new Session([]), { lifetime: "transient" });
    const root = collection.build();
    const scope = root.createScope();
    expect(root.get(Session)).not.toBe(scope.get(Session));
  });
});

describe("cycle detection", () => {
  it("rejects a two-service cycle with .NET's message", () => {
    const services = new ServiceCollection();
    services.register(A, (s) => new A(s.get(B)));
    services.register(B, (s) => new B(s.get(A)));
    const root = services.build();
    let message: string | undefined;
    try {
      root.get(A);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe("A circular dependency was detected for the service of type 'A'.");
  });

  it("rejects a self-referential factory, through a scope", () => {
    const services = new ServiceCollection();
    services.register(Session, (s) => (void s.get(Session), new Session([])));
    const scope = services.build().createScope();
    expect(() => scope.get(Session)).toThrowError(/circular dependency was detected for the service of type 'Session'/);
  });
});

describe("dispose", () => {
  it("disposes created instances in reverse creation order", () => {
    const journal: string[] = [];
    const services = new ServiceCollection();
    services.register(Logger, () => new Logger(journal), { lifetime: "scoped" });
    services.register(
      Session,
      (s: ServiceProvider) => {
        void s.get(Logger);
        return new Session(journal);
      },
      { lifetime: "scoped" },
    );
    const scope = services.build().createScope();
    const session = scope.get(Session);
    scope.dispose();
    // Reverse creation order: Session before Logger; session got its dispose().
    expect(journal).toEqual(["Logger", "Session", "Session disposed", "Logger disposed"]);
    expect(session.disposed).toBe(true);
  });

  it("does not dispose registerValue constants (idempotent dispose)", () => {
    const services = new ServiceCollection();
    const clock = new Clock();
    services.registerValue(Clock, clock);
    const root = services.build();
    const scope = root.createScope();
    expect(scope.get(Clock)).toBe(clock);
    scope.dispose();
    scope.dispose();
    // The constant stays usable — its owner decides (like the app's NavigationManager).
    expect(clock.ticks).toBe(0);
    expect(() => root.get(Clock)).not.toThrow();
  });

  it("disposes singletons only when the root disposes, not a scope", () => {
    const journal: string[] = [];
    const services = new ServiceCollection();
    services.register(Logger, () => new Logger(journal));
    const root = services.build();
    const scope = root.createScope();
    expect(scope.get(Logger)).toBe(root.get(Logger));
    scope.dispose();
    expect(journal).toEqual(["Logger"]); // created, not disposed — the root owns it
    root.dispose();
    expect(journal).toEqual(["Logger", "Logger disposed"]);
  });
});
describe("the provider as a service (Blazor's IServiceProvider)", () => {
  it("resolves itself — the requesting scope — so a component can ask tryGet for an optional service", () => {
    const root = new ServiceCollection().registerType(Clock).build();
    const scope = root.createScope();
    expect(root.get(ServiceProvider)).toBe(root);
    expect(scope.get(ServiceProvider)).toBe(scope);
    // C#'s `GetService<T>() ?? fallback`: tryGet answers undefined for what nobody registered.
    expect(scope.get(ServiceProvider).tryGet(Logger)).toBeUndefined();
    expect(scope.get(ServiceProvider).tryGet(Clock)).toBeInstanceOf(Clock);
  });
});
