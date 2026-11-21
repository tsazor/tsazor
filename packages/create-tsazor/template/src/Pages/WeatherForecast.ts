/** One day of the sample forecast in public/sample-data/weather.json. */
export interface WeatherForecast {
    /** An ISO date, `2022-01-06`. */
    date: string;
    temperatureC: number;
    summary: string | null;
}

/** The temperature in Fahrenheit, computed as in the Blazor template. */
export function temperatureF(forecast: WeatherForecast): number {
    return 32 + Math.trunc(forecast.temperatureC / 0.5556);
}

/** The date in the user's format; `T00:00` reads it as a local date, not as midnight UTC. */
export function formatDate(date: string): string {
    return new Date(`${date}T00:00`).toLocaleDateString();
}
