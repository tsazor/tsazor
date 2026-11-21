// GENERATED CODE — do not edit by hand.

import { WeatherForecast } from "./models";
import type { SignupRequest, SignupResult } from "./models";

import { OpenApiClient, type HttpResult, type RequestOptions } from "@tsazor/dotnet";
import { TsazorHttp } from "@tsazor/runtime";

export class ServerClient extends OpenApiClient {
    constructor(http: TsazorHttp) {
        super(http);
    }

    getWeatherForecast(options?: RequestOptions): Promise<HttpResult<WeatherForecast[]>> {
        return this.call("GET", `/api/weatherforecast`, undefined, options).then((result) => (result.ok ? { ...result, body: ((result.body as unknown[]) ?? []).map((item) => WeatherForecast.fromJson(item))! } : result));
    }

    createSignup(body: SignupRequest, options?: RequestOptions): Promise<HttpResult<SignupResult>> {
        return this.call("POST", `/api/signups`, body, options);
    }
}
