import { icon, type FluentTokenOverrides } from "@tsazor/fluent";

/**
 * Client.Infrastructure/Settings/BlazorHeroTheme.cs as Fluent token overrides: BlazorHero's blue as the brand ramp,
 * Montserrat as the typeface (index.html loads it, as the original's does). The original's primary, #1E88E5, carries
 * white text at 3.6:1 and reads at 3.6:1 as a link on white — both under WCAG AA's 4.5. Fluent's brand-80 is the
 * fill behind white text and, in the light theme, the colour of links and accents on the page's near-white, so it
 * is the darker blue of the same Material palette that passes both, #1565C0 (5.5:1 on the page). The dark theme's
 * accent, brand-100, stays #2196F3 (4.6:1 on its dark surfaces); its fills are brand-70.
 */
export const tokenOverrides: FluentTokenOverrides = {
    "--fui-brand-40": "#082F6E",
    "--fui-brand-60": "#0B3C8A",
    "--fui-brand-70": "#0D47A1",
    "--fui-brand-80": "#1565C0",
    "--fui-brand-90": "#1976D2",
    "--fui-brand-100": "#2196F3",
    "--fui-brand-110": "#42A5F5",
    "--fui-brand-120": "#64B5F6",
    "--fui-brand-130": "#90CAF9",
    "--fui-brand-140": "#BBDEFB",
    "--fui-brand-150": "#E3F2FD",
    "--fui-brand-160": "#F1F8FE",
    "--fui-font-family": "Montserrat, Helvetica, Arial, sans-serif",
};

/** Client/CustomIcons.cs: the BlazorHero logo (viewBox 0 0 500 500). */
export const BlazorHeroLogo = icon(
    "BlazorHero",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" fill="currentColor"><path d="M 37.00,90.00 C 37.00,90.00 328.90,90.00 328.90,90.00 328.90,90.00 328.90,410.00 328.90,410.00 328.90,410.00 37.00,410.00 37.00,410.00 37.00,410.00 37.00,90.00 37.00,90.00 Z M 381.49,90.75 C 381.49,90.75 464.00,90.75 464.00,90.75 464.00,90.75 464.00,410.00 464.00,410.00 464.00,410.00 381.49,410.00 381.49,410.00 381.49,410.00 381.49,280.80 381.49,280.80 381.49,280.80 337.37,280.80 337.37,280.80 337.37,280.80 337.37,220.44 337.37,220.44 337.37,220.44 381.49,220.44 381.49,220.44 381.49,220.44 381.49,90.75 381.49,90.75 Z M 119.51,150.36 C 119.51,150.36 119.51,220.44 119.51,220.44 119.51,220.44 236.91,220.44 236.91,220.44 236.91,220.44 236.91,280.80 236.91,280.80 236.91,280.80 119.51,280.80 119.51,280.80 119.51,280.80 119.51,349.64 119.51,349.64 119.51,349.64 246.39,349.64 246.39,349.64 246.39,349.64 246.39,150.36 246.39,150.36 246.39,150.36 119.51,150.36 119.51,150.36 Z"/></svg>`,
);
