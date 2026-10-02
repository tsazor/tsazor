export interface Forecast {
    day: string;
    summary: string;
    temperature: number;
}

/** Pretends to fetch the forecast from a server. */
export async function getForecast(): Promise<Forecast[]> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return [
        { day: "Monday", summary: "Sunny", temperature: 24 },
        { day: "Tuesday", summary: "Cloudy", temperature: 19 },
        { day: "Wednesday", summary: "Rain", temperature: 15 },
    ];
}
