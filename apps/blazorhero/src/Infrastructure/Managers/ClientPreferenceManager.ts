import { StorageConstants, LocalizationConstants } from "../../Application/Constants";
import type { LocalStorage } from "../LocalStorage";

/** Client.Infrastructure/Settings/ClientPreference.cs, as the original stores it in localStorage. */
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
        return {
            isDarkMode: false,
            isRTL: false,
            isDrawerOpen: false,
            primaryColor: null,
            languageCode: LocalizationConstants.SupportedLanguages[0].code,
            ...this.localStorage.getItem<Partial<ClientPreference>>(StorageConstants.Local.Preference),
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
        this.localStorage.setItem(StorageConstants.Local.Preference, preference);
    }
}
