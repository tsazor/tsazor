// GENERATED CODE — do not edit by hand.
// Source: OpenAPI MyApp.Server | v1 1.0.0

import { Range, Required, StringLength } from "@tsazor/runtime";

import { DateOnly } from "@tsazor/primitives";

export class HttpValidationProblemDetails {
    type?: string | null;
    title?: string | null;
    status?: number | null;
    detail?: string | null;
    instance?: string | null;
    errors!: Record<string, string[]>;
    static fromJson(data: unknown): HttpValidationProblemDetails { return data as HttpValidationProblemDetails; }
}

export class SignupRequest {
    @Required()
    @StringLength(50, { minimumLength: 0 })
    name = "";
    @Required()
    email = "";
    @Range(18, 120)
    age = 0;
    static fromJson(data: unknown): SignupRequest { return data as SignupRequest; }
}

export class SignupResult {
    @Required()
    message = "";
    static fromJson(data: unknown): SignupResult { return data as SignupResult; }
}

export class WeatherForecast {
    @Required()
    date!: DateOnly;
    temperatureC = 0;
    summary: string | null = null;
    static fromJson(data: unknown): WeatherForecast {
        const source = data as Record<string, unknown>;
        return {
            ...(data as WeatherForecast),
        date: DateOnly.parse(source["date"] as unknown as string)!,
        };
    }
}
