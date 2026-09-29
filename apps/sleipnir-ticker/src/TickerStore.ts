import type { SleipnirSubscription } from "sleipnir-client";
import type {
    PricePoint,
    SleipnirClient,
    TickerFeedStatus,
    TickerSnapshot,
} from "./api";
import { changeVariant, formatPct, formatUsd, pushCapped, timeLabel } from "./formatters.mjs";

export type Unsubscribe = () => void;

export interface TickerLogEntry {
    /** Wall-clock ms of receipt (for the log label). */
    at: number;
    /** The tick itself (typed from the generated contract). */
    snapshot: TickerSnapshot;
    changeText: string;
    changeVariant: "success" | "danger" | "secondary";
}

const LOG_CAPACITY = 30;
const POINTS_CAPACITY = 600;
/** How often (in ticks) the feed-status is refreshed alongside the tick. */
const STATUS_EVERY = 10;

/**
 * App-wide live-data store. One SSE subscription to the Sleipnir event
 * (Market.TickerUpdated) for the whole page lifetime — pages subscribe to
 * store changes in onInitialized and unsubscribe in dispose(). The data
 * layer itself is the GENERATED Client from `sleipnir-codegen`; this class
 * only manages state and subscriptions, no hand-written wire calls.
 */
export default class TickerStore {
    private readonly client: SleipnirClient;
    private readonly listeners = new Set<Unsubscribe>();
    private subscription: SleipnirSubscription | null = null;
    private ticks = 0;

    /** Current snapshot; null before the first successful call. */
    current: TickerSnapshot | null = null;
    /** Historical price points (seeded from GetHistory, extended by each tick). */
    points: PricePoint[] = [];
    log: TickerLogEntry[] = [];
    status: TickerFeedStatus | null = null;
    /** True once the SSE subscription handshake succeeded. */
    subscribed = false;
    lastError: string | null = null;
    loading = true;

    readonly started: Promise<void>;

    constructor(client: SleipnirClient) {
        this.client = client;
        this.started = this.start();
    }

    private async start(): Promise<void> {
        try {
            const [ticker, history] = await Promise.all([
                this.client.call(this.client.market.getTicker()),
                this.client.call(this.client.market.getHistory(POINTS_CAPACITY)),
            ]);
            this.current = ticker.data;
            this.points = history.data?.points ?? [];
            await this.refreshStatus();

            this.subscription = await this.client.market.tickerUpdated({
                onNext: (snapshot) => this.onSnapshot(snapshot),
                onError: (err) => {
                    this.lastError = String(err);
                    this.notify();
                },
            });
            this.subscribed = true;
            this.loading = false;
            this.notify();
        } catch (err) {
            this.lastError = String(err);
            this.loading = false;
            this.notify();
        }
    }

    subscribe(listener: Unsubscribe): Unsubscribe {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** True when the upstream feed is real-time via Binance websocket. */
    get isLive(): boolean {
        return this.status?.mode === "binance" || this.current?.mode === "binance";
    }

    get priceText(): string {
        return formatUsd(this.current?.lastPrice);
    }

    get changeText(): string {
        return formatPct(this.current?.priceChangePercent);
    }

    get changeVariant(): "success" | "danger" | "secondary" {
        return changeVariant(this.current?.priceChangePercent);
    }

    get highText(): string {
        return formatUsd(this.current?.high);
    }

    get lowText(): string {
        return formatUsd(this.current?.low);
    }

    get volumeText(): string {
        return `${this.current?.volume ?? "—"}`;
    }

    get quoteVolumeText(): string {
        return `${this.current?.quoteVolume ?? "—"}`;
    }

    get statusText(): string {
        if (this.loading) return "initializing";
        if (!this.subscribed) return "disconnected";
        return this.isLive ? "Binance live" : "synthetic feed";
    }

    get statusVariant(): "success" | "warning" | "secondary" {
        if (this.loading) return "secondary";
        if (!this.subscribed) return "warning";
        return "success";
    }

    get updatedText(): string {
        const ms = this.current?.serverTimeUtc;
        if (!ms) return "—";
        return timeLabel(Date.parse(ms));
    }

    private onSnapshot(snapshot: TickerSnapshot): void {
        this.current = snapshot;
        this.points = pushCapped(this.points, { t: snapshot.eventTimeMs, price: snapshot.lastPrice }, POINTS_CAPACITY);
        this.log = [
            {
                at: Date.now(),
                snapshot,
                changeText: formatPct(snapshot.priceChangePercent),
                changeVariant: changeVariant(snapshot.priceChangePercent),
            },
            ...this.log,
        ].slice(0, LOG_CAPACITY);
        this.ticks++;
        if (this.ticks % STATUS_EVERY === 0) {
            void this.client.call(this.client.market.getStatus()).then((resp) => {
                if (resp.data) this.status = resp.data;
            }).catch(() => { /* status keeps last known value */ });
        }
        this.notify();
    }

    private async refreshStatus(): Promise<void> {
        const resp = await this.client.call(this.client.market.getStatus());
        this.status = resp.data;
    }

    private notify(): void {
        for (const listener of [...this.listeners]) listener();
    }
}