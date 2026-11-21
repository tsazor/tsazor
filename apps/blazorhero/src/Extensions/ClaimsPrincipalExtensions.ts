import type { ClaimsPrincipal } from "@tsazor/runtime";

// Client/Extensions/ClaimsPrincipalExtensions.cs: the claims BlazorHero's token carries, under Microsoft's long
// claim types (ClaimTypes.Email, .Name, …). C#'s extension methods become functions of the user.

const ClaimTypes = {
    Email: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    Name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
    Surname: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
    MobilePhone: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/mobilephone",
    NameIdentifier: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
} as const;

/** ClaimsPrincipal.FindFirstValue. */
function findFirstValue(user: ClaimsPrincipal, type: string): string {
    return user.claims.find((claim) => claim.type === type)?.value ?? "";
}

export const getEmail = (user: ClaimsPrincipal) => findFirstValue(user, ClaimTypes.Email);
export const getFirstName = (user: ClaimsPrincipal) => findFirstValue(user, ClaimTypes.Name);
export const getLastName = (user: ClaimsPrincipal) => findFirstValue(user, ClaimTypes.Surname);
export const getPhoneNumber = (user: ClaimsPrincipal) => findFirstValue(user, ClaimTypes.MobilePhone);
export const getUserId = (user: ClaimsPrincipal) => findFirstValue(user, ClaimTypes.NameIdentifier);
