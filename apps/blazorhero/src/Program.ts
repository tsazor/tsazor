import "@tsazor/fluent/fluent.css";
import "./app.css";
import { AuthenticationStateProvider, AuthorizationService, createTsazorApp, CultureService, StringLocalizer, TsazorHttp } from "@tsazor/runtime";
import { attachJwtAuth } from "@tsazor/dotnet";
import { addFluent, Toaster } from "@tsazor/fluent";
import routes from "virtual:tsazor-routes";
import App from "./App.tsazor";
import { ApplicationClaimTypes, cultureOf, registeredPermissions } from "./Application/Constants";
import { tables } from "./i18n";
import { BlazorHeroStateProvider } from "./Infrastructure/Authentication/BlazorHeroStateProvider";
import { LocalStorage } from "./Infrastructure/LocalStorage";
import { AuthenticationManager } from "./Infrastructure/Managers/AuthenticationManager";
import { ClientPreferenceManager } from "./Infrastructure/Managers/ClientPreferenceManager";
import { BrandManager, ProductManager } from "./Infrastructure/Managers/CatalogManagers";
import { AccountManager, RoleManager, UserManager } from "./Infrastructure/Managers/IdentityManagers";

// Client/Program.cs and WebAssemblyHostBuilderExtensions.AddClientServices.

const localStorage = new LocalStorage();
const preferences = new ClientPreferenceManager(localStorage);

// The culture comes from the stored preference before the app starts (Program.cs: DefaultThreadCurrentCulture).
// The API translates its messages by Accept-Language: the language's two letters, as the original's HttpClient sent.
const culture = cultureOf(preferences.getPreference().languageCode);
const headers = { "accept-language": culture.split("-")[0]! };
// The stored language is the user's choice: explicit, so the app default (en, the tables' fallback) stays below it.
const cultureService = new CultureService();
cultureService.setExplicit(culture);

// The token endpoints are anonymous and the refresh must not wait for itself: a client of their own.
const tokens = new TsazorHttp({ defaultHeaders: headers });
const http = new TsazorHttp({ defaultHeaders: headers });
const stateProvider = new BlazorHeroStateProvider(localStorage);
const authenticationManager = new AuthenticationManager(tokens, localStorage, stateProvider);

// AddAuthorizationCore(RegisterPermissionClaims): one policy per permission, met by the user's Permission claim.
const authorization = new AuthorizationService();
for (const permission of registeredPermissions()) {
    authorization.addPolicy(permission, (user) => user.claims.some((claim) => claim.type === ApplicationClaimTypes.Permission && claim.value === permission));
}

const app = createTsazorApp({
    root: App,
    routes,
    localization: { defaultCulture: "en", tables },
    services: (services) => {
        services.registerValue(CultureService, cultureService);
        services.registerValue(TsazorHttp, http);
        services.registerValue(LocalStorage, localStorage);
        services.registerValue(ClientPreferenceManager, preferences);
        services.registerValue(BlazorHeroStateProvider, stateProvider);
        services.registerValue(AuthenticationStateProvider, stateProvider);
        services.registerValue(AuthorizationService, authorization);
        services.registerValue(AuthenticationManager, authenticationManager);
        services.registerValue(AccountManager, new AccountManager(http));
        services.registerValue(UserManager, new UserManager(http));
        services.registerValue(RoleManager, new RoleManager(http));
        services.registerValue(BrandManager, new BrandManager(http));
        services.registerValue(ProductManager, new ProductManager(http));
        addFluent(services);
    },
});

// HttpInterceptorManager: the token is renewed in its last minute, with a toast; a failed renewal signs out (and
// AuthorizeRouteView shows the login).
const toaster = app.services.get(Toaster);
const localizer = app.services.get(StringLocalizer);
attachJwtAuth(http, stateProvider, {
    refresh: async (token) => {
        const renewed = await authenticationManager.refreshToken(token).catch(() => undefined);
        if (renewed === undefined) toaster.show({ message: localizer.get("HttpInterceptorManager.You are Logged Out."), intent: "danger" });
        else toaster.show({ message: localizer.get("HttpInterceptorManager.Refreshed Token."), intent: "success" });
        return renewed;
    },
});
