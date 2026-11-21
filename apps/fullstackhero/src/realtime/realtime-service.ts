import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  HttpTransportType,
  LogLevel,
} from "@microsoft/signalr";
import { env } from "@/env";
import { tokenStore } from "@/auth/token-store";

export type RealtimeStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

type Listener = (payload: unknown) => void;

/**
 * realtime/realtime-context.tsx's RealtimeProvider as a service: a single shared SignalR connection to
 * /api/v1/realtime/hub, authenticated via ?access_token=, reconnecting with backoff [2s, 5s, 10s, 30s]. Admin only
 * wires NotificationCreated. It rebuilds on every token change (the provider's effect on `tokenEpoch`), so login,
 * refresh and logout tear the connection down cleanly. `on` is `useRealtimeEvent`: a component subscribes in
 * onInitialized and unsubscribes with the function it returns (or `observe`s `realtime.event(name)`).
 */
export class RealtimeService {
  status: RealtimeStatus = "idle";

  private connection: HubConnection | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();
  private stopped = false;
  private token = tokenStore.getAccessToken();

  constructor() {
    tokenStore.subscribe(() => this.tokenChanged());
    void this.connect();
  }

  /**
   * The connection depends on the access token only. The original's provider rebuilds it on every token store
   * notification, the permissions' too, which a sign-in sends right after the tokens: when they arrive before the hub's
   * negotiation ends, the first connection is stopped mid-negotiation ("The connection was stopped during
   * negotiation", against the real backend — a race the original wins only by timing). So: a rebuild per new token.
   */
  private tokenChanged(): void {
    const token = tokenStore.getAccessToken();
    if (token === this.token) return;
    this.token = token;
    this.restart();
  }

  /** Wire a handler for a server event. Returns an unsubscribe function. */
  on<T = unknown>(event: string, handler: (payload: T) => void): () => void {
    let bucket = this.listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(event, bucket);
    }
    const cast = handler as unknown as Listener;
    bucket.add(cast);
    return () => {
      bucket?.delete(cast);
    };
  }

  /** A server event as an observable source, for a component's `observe(realtime.event(name), handler)`. */
  event<T = unknown>(name: string): { subscribe: (listener: (payload: T) => void) => () => void } {
    return { subscribe: (listener) => this.on<T>(name, listener) };
  }

  private restart(): void {
    // The effect's cleanup, then the effect again.
    this.stopped = true;
    const connection = this.connection;
    this.connection = null;
    if (connection && connection.state !== HubConnectionState.Disconnected) void connection.stop();
    this.status = "idle";
    this.stopped = false;
    void this.connect();
  }

  private build(): HubConnection {
    const backoffs = [0, 2_000, 5_000, 10_000, 30_000];
    const url = `${env.apiBase || ""}/api/v1/realtime/hub`;
    return new HubConnectionBuilder()
      .withUrl(url, {
        accessTokenFactory: () => tokenStore.getAccessToken() ?? "",
        transport: HttpTransportType.WebSockets | HttpTransportType.ServerSentEvents | HttpTransportType.LongPolling,
      })
      // SignalR's automatic reconnect re-negotiates internally, bypassing connect()'s
      // token guard. When the user is signed out (token cleared/expired) every reconnect
      // fires an anonymous negotiate the API 401s and logs — so stop retrying the moment
      // there's no token. onclose then rebuilds lazily once a token lands back in storage.
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (context) =>
          tokenStore.getAccessToken() ? (backoffs.slice(1)[context.previousRetryCount] ?? null) : null,
      })
      .configureLogging(LogLevel.Warning)
      .build();
  }

  private wire(connection: HubConnection): void {
    // Pre-register every event admin cares about so late subscribers don't miss the first payload.
    for (const name of ["NotificationCreated"]) {
      connection.on(name, (payload: unknown) => {
        const list = this.listeners.get(name);
        if (list) for (const listener of [...list]) listener(payload);
      });
    }
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    if (!tokenStore.getAccessToken()) {
      this.status = "idle";
      return;
    }
    this.status = "connecting";
    const connection = this.build();
    this.connection = connection;
    this.wire(connection);

    const current = (): boolean => this.connection === connection && !this.stopped;
    connection.onreconnecting(() => {
      if (current()) this.status = "reconnecting";
    });
    connection.onreconnected(() => {
      if (current()) this.status = "connected";
    });
    connection.onclose(async () => {
      if (!current()) return;
      this.status = "error";
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      if (current()) void this.connect();
    });

    try {
      await connection.start();
      if (current()) this.status = "connected";
    } catch {
      if (!current()) return;
      this.status = "error";
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      if (current()) void this.connect();
    }
  }
}
