import { HubConnectionBuilder, LogLevel, type HubConnection } from "@microsoft/signalr";
import type { NavigationManager } from "@tsazor/runtime";
import { ApplicationConstants } from "../Application/Constants";
import type { BlazorHeroStateProvider } from "../Infrastructure/Authentication/BlazorHeroStateProvider";

/**
 * Client/Extensions/HubExtensions.cs (TryInitialize): the connection to BlazorHero's hub, with the user's token as
 * the access token (the hub reads it from the query string, as browsers can't set WebSocket headers). SignalR's
 * JavaScript client has the C# client's builder, so the code reads the same.
 */
export function createHubConnection(navigationManager: NavigationManager, stateProvider: BlazorHeroStateProvider): HubConnection {
    return new HubConnectionBuilder()
        .withUrl(navigationManager.toAbsoluteUri(ApplicationConstants.SignalR.HubUrl), {
            accessTokenFactory: () => stateProvider.getToken() ?? "",
        })
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build();
}
