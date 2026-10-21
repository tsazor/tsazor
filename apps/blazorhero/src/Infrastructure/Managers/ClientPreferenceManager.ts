import { StorageConstants, LocalizationConstants } from "../../Application/Constants";
import type { LocalStorage } from "../LocalStorage";

/** Client.Infrastructure/Settings/ClientPreference.cs. */
export interface ClientPreference {
    isDarkMode: boolean;
    isRTL: boolean;
    isDrawerOpen: boolean;
    primaryColor: string | null;
    languageCode: string;
}

/**
 * Client.Infrastructure/Managers/Preferences/ClientPreferenceManager.cs: dark mode, right-to-left and the language,
 * in localStorage. Two of the original's quirks are not copied: ToggleDarkModeAsync answered the opposite of "is
 * dark now", and IsRTL said false whenever dark mode was on, so right-to-left was lost on a reload in dark mode (U4).
 */
export class ClientPreferenceManager {
    constructor(private readonly localStorage: LocalStorage) {}

    getPreference(): ClientPreference {
        const stored = this.localStorage.getItem<Partial<StoredPreference>>(StorageConstants.Local.Preference) ?? {};
        return {
            isDarkMode: stored.IsDarkMode ?? false,
            isRTL: stored.IsRTL ?? false,
            isDrawerOpen: stored.IsDrawerOpen ?? false,
            primaryColor: stored.PrimaryColor ?? null,
            languageCode: stored.LanguageCode ?? LocalizationConstants.SupportedLanguages[0].code,
        };
    }

    /** Toggles dark mode; returns whether it is dark now. */
    toggleDarkMode(): boolean {
        const preference = this.getPreference();
        preference.isDarkMode = !preference.isDarkMode;
        this.setPreference(preference);
        return preference.isDarkMode;
    }

    /** Toggles right-to-left; returns whether it is right-to-left now. */
    toggleLayoutDirection(): boolean {
        const preference = this.getPreference();
        preference.isRTL = !preference.isRTL;
        this.setPreference(preference);
        return preference.isRTL;
    }

    changeLanguage(languageCode: string): void {
        this.setPreference({ ...this.getPreference(), languageCode });
    }

    isDarkMode(): boolean {
        return this.getPreference().isDarkMode;
    }

    isRTL(): boolean {
        return this.getPreference().isRTL;
    }

    private setPreference(preference: ClientPreference): void {
        const stored: StoredPreference = {
            IsDarkMode: preference.isDarkMode,
            IsRTL: preference.isRTL,
            IsDrawerOpen: preference.isDrawerOpen,
            PrimaryColor: preference.primaryColor,
            LanguageCode: preference.languageCode,
        };
        this.localStorage.setItem(StorageConstants.Local.Preference, stored);
    }
}

/**
 * The preference as the original stores it: Blazored.LocalStorage writes it with System.Text.Json's defaults, so the
 * names are the C# ones (`IsRTL`, `LanguageCode`) — unlike the API's camelCase JSON (ASP.NET's web defaults, B33).
 */
interface StoredPreference {
    IsDarkMode: boolean;
    IsRTL: boolean;
    IsDrawerOpen: boolean;
    PrimaryColor: string | null;
    LanguageCode: string;
}
