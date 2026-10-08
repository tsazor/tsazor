import { problemMessage, type HttpResult } from "@tsazor/dotnet";
import { TsazorHttp } from "@tsazor/runtime";

/**
 * A failed API call, thrown so that the plugin's form shows the API's message. FluentCMS's NSwag
 * clients throw ApiClientException, and its PluginForm catches it.
 */
export class ApiError extends Error {}

/** The body of a successful call; throws ApiError with the API's message otherwise. */
export function ensureOk<T>(result: HttpResult<T>): T {
    if (!result.ok) throw new ApiError(problemMessage(result));
    return result.body;
}

/** Signs out at the BFF, which drops the session cookie (and with it the user's JWT). */
export async function signOut(http: TsazorHttp): Promise<void> {
    await http.send(new Request(new URL("/bff/logout", document.baseURI), { method: "POST" }));
}
