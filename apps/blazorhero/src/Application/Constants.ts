// BlazorHero.Shared's constants (Shared/Constants), as the client uses them.

/** Shared/Constants/Storage/StorageConstants.cs: the keys in localStorage. */
export const StorageConstants = {
    Local: {
        Preference: "clientPreference",
        AuthToken: "authToken",
        RefreshToken: "refreshToken",
        UserImageURL: "userImageURL",
    },
} as const;

/** Shared/Constants/Application/ApplicationConstants.cs: the SignalR hub and its messages. */
export const ApplicationConstants = {
    SignalR: {
        HubUrl: "/signalRHub",
        SendUpdateDashboard: "UpdateDashboardAsync",
        ReceiveUpdateDashboard: "UpdateDashboard",
        SendRegenerateTokens: "RegenerateTokensAsync",
        ReceiveRegenerateTokens: "RegenerateTokens",
        ReceiveChatNotification: "ReceiveChatNotification",
        SendChatNotification: "ChatNotificationAsync",
        ReceiveMessage: "ReceiveMessage",
        SendMessage: "SendMessageAsync",
        OnConnect: "OnConnectAsync",
        ConnectUser: "ConnectUser",
        OnDisconnect: "OnDisconnectAsync",
        DisconnectUser: "DisconnectUser",
        OnChangeRolePermissions: "OnChangeRolePermissions",
        LogoutUsersByRole: "LogoutUsersByRole",
        PingRequest: "PingRequestAsync",
        PingResponse: "PingResponseAsync",
    },
    MimeTypes: {
        OpenXml: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
} as const;

/** Shared/Constants/Permission/ApplicationClaimType.cs. */
export const ApplicationClaimTypes = {
    Permission: "Permission",
} as const;

/** Shared/Constants/Localization/LocalizationConstants.cs: the languages the selector offers. */
export const LocalizationConstants = {
    SupportedLanguages: [
        { code: "en-US", displayName: "English" },
        { code: "fr-FR", displayName: "French" },
        // Upstream writes "km_KH" (U3): not a BCP 47 tag. `cultureOf` reads it as km-KH.
        { code: "km_KH", displayName: "Khmer" },
        { code: "de-DE", displayName: "German" },
        { code: "nl-NL", displayName: "Dutch - Netherlands" },
        { code: "es-ES", displayName: "Spanish" },
        { code: "ru-RU", displayName: "Russian" },
        { code: "sv-SE", displayName: "Swedish" },
        { code: "id-ID", displayName: "Indonesia" },
        { code: "it-IT", displayName: "Italian" },
        { code: "ar", displayName: "عربي" },
    ],
} as const;

/** A language code of LocalizationConstants as a BCP 47 tag (km_KH → km-KH). */
export function cultureOf(code: string): string {
    return code.replace(/_/g, "-");
}

/** Shared/Constants/Permission/Permissions.cs: one policy per permission (RegisterPermissionClaims). */
export const Permissions = {
    Products: {
        View: "Permissions.Products.View",
        Create: "Permissions.Products.Create",
        Edit: "Permissions.Products.Edit",
        Delete: "Permissions.Products.Delete",
        Export: "Permissions.Products.Export",
        Search: "Permissions.Products.Search",
    },
    Brands: {
        View: "Permissions.Brands.View",
        Create: "Permissions.Brands.Create",
        Edit: "Permissions.Brands.Edit",
        Delete: "Permissions.Brands.Delete",
        Export: "Permissions.Brands.Export",
        Search: "Permissions.Brands.Search",
        Import: "Permissions.Brands.Import",
    },
    Documents: {
        View: "Permissions.Documents.View",
        Create: "Permissions.Documents.Create",
        Edit: "Permissions.Documents.Edit",
        Delete: "Permissions.Documents.Delete",
        Search: "Permissions.Documents.Search",
    },
    DocumentTypes: {
        View: "Permissions.DocumentTypes.View",
        Create: "Permissions.DocumentTypes.Create",
        Edit: "Permissions.DocumentTypes.Edit",
        Delete: "Permissions.DocumentTypes.Delete",
        Export: "Permissions.DocumentTypes.Export",
        Search: "Permissions.DocumentTypes.Search",
    },
    DocumentExtendedAttributes: {
        View: "Permissions.DocumentExtendedAttributes.View",
        Create: "Permissions.DocumentExtendedAttributes.Create",
        Edit: "Permissions.DocumentExtendedAttributes.Edit",
        Delete: "Permissions.DocumentExtendedAttributes.Delete",
        Export: "Permissions.DocumentExtendedAttributes.Export",
        Search: "Permissions.DocumentExtendedAttributes.Search",
    },
    Users: {
        View: "Permissions.Users.View",
        Create: "Permissions.Users.Create",
        Edit: "Permissions.Users.Edit",
        Delete: "Permissions.Users.Delete",
        Export: "Permissions.Users.Export",
        Search: "Permissions.Users.Search",
    },
    Roles: {
        View: "Permissions.Roles.View",
        Create: "Permissions.Roles.Create",
        Edit: "Permissions.Roles.Edit",
        Delete: "Permissions.Roles.Delete",
        Search: "Permissions.Roles.Search",
    },
    RoleClaims: {
        View: "Permissions.RoleClaims.View",
        Create: "Permissions.RoleClaims.Create",
        Edit: "Permissions.RoleClaims.Edit",
        Delete: "Permissions.RoleClaims.Delete",
        Search: "Permissions.RoleClaims.Search",
    },
    Communication: {
        Chat: "Permissions.Communication.Chat",
    },
    Preferences: {
        ChangeLanguage: "Permissions.Preferences.ChangeLanguage",
    },
    Dashboards: {
        View: "Permissions.Dashboards.View",
    },
    Hangfire: {
        View: "Permissions.Hangfire.View",
    },
    AuditTrails: {
        View: "Permissions.AuditTrails.View",
        Export: "Permissions.AuditTrails.Export",
        Search: "Permissions.AuditTrails.Search",
    },
} as const;

/** Permissions.GetRegisteredPermissions(): every permission, for the policies. */
export function registeredPermissions(): string[] {
    return Object.values(Permissions).flatMap((group) => Object.values(group));
}
