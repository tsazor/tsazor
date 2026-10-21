import type { ModelValidator } from "@tsazor/runtime";
import type { Localizer } from "../../i18n";
import type { ChangePasswordRequest, RegisterRequest, ResetPasswordRequest } from "../Identity";

// Application/Validators/Requests/Identity (FluentValidation) as EditForm validators: per field, the message of its
// first failing rule. FluentValidation's EmailAddress() checks what ASP.NET Core's [EmailAddress] does: one "@",
// neither first nor last.

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const blank = (value: unknown): boolean => text(value).trim() === "";

function isEmailAddress(value: string): boolean {
    const at = value.indexOf("@");
    return at > 0 && at === value.lastIndexOf("@") && at < value.length - 1;
}

type EmailKeys = "Email is required" | "Email is not correct";

/** `.Must(not blank).EmailAddress()`, the email rule of four validators. */
function emailRule(L: (key: EmailKeys) => string): ModelValidator {
    return (value) => {
        if (blank(value)) return L("Email is required");
        return isEmailAddress(text(value)) ? null : L("Email is not correct");
    };
}

type PasswordKeys =
    | "Password is required!"
    | "Password must be at least of length 8"
    | "Password must contain at least one capital letter"
    | "Password must contain at least one lowercase letter"
    | "Password must contain at least one digit";

/** The new password's rules, the same in RegisterRequest-, ResetPasswordRequest- and ChangePasswordRequestValidator. */
function passwordRule(L: (key: PasswordKeys) => string): ModelValidator {
    return (value) => {
        const password = text(value);
        if (password.trim() === "") return L("Password is required!");
        if (password.length < 8) return L("Password must be at least of length 8");
        if (!/[A-Z]/.test(password)) return L("Password must contain at least one capital letter");
        if (!/[a-z]/.test(password)) return L("Password must contain at least one lowercase letter");
        if (!/[0-9]/.test(password)) return L("Password must contain at least one digit");
        return null;
    };
}

/** `.Must(not blank).Equal(request => request.<password>)`: the confirmation of the password `passwordOf` reads. */
function confirmationRule(L: (key: "Password Confirmation is required!" | "Passwords don't match") => string, passwordOf: (model: unknown) => string): ModelValidator {
    return (value, model) => {
        if (blank(value)) return L("Password Confirmation is required!");
        return value === passwordOf(model) ? null : L("Passwords don't match");
    };
}

/** TokenRequestValidator.cs. */
export function tokenRequestValidators(L: Localizer<"TokenRequestValidator">): Record<string, ModelValidator> {
    return {
        email: emailRule(L),
        password: (value) => (blank(value) ? L("Password is required!") : null),
    };
}

/** RegisterRequestValidator.cs. */
export function registerRequestValidators(L: Localizer<"RegisterRequestValidator">): Record<string, ModelValidator> {
    return {
        firstName: (value) => (blank(value) ? L("First Name is required") : null),
        lastName: (value) => (blank(value) ? L("Last Name is required") : null),
        email: emailRule(L),
        userName: (value) => {
            if (blank(value)) return L("UserName is required");
            return text(value).length < 6 ? L("UserName must be at least of length 6") : null;
        },
        password: passwordRule(L),
        confirmPassword: confirmationRule(L, (model) => (model as RegisterRequest).password),
    };
}

/** ChangePasswordRequestValidator.cs. */
export function changePasswordRequestValidators(L: Localizer<"ChangePasswordRequestValidator">): Record<string, ModelValidator> {
    return {
        password: (value) => (blank(value) ? L("Current Password is required!") : null),
        newPassword: passwordRule(L),
        confirmNewPassword: confirmationRule(L, (model) => (model as ChangePasswordRequest).newPassword),
    };
}

/** ForgotPasswordRequestValidator.cs. */
export function forgotPasswordRequestValidators(L: Localizer<"ForgotPasswordRequestValidator">): Record<string, ModelValidator> {
    return { email: emailRule(L) };
}

/**
 * ResetPasswordRequestValidator.cs, without its Token rule: the token has no field, so its message could show
 * nowhere — the page says "Token Not Found!" itself, as the original's code means to (U15).
 */
export function resetPasswordRequestValidators(L: Localizer<"ResetPasswordRequestValidator">): Record<string, ModelValidator> {
    return {
        email: emailRule(L),
        password: passwordRule(L),
        confirmPassword: confirmationRule(L, (model) => (model as ResetPasswordRequest).password),
    };
}

/** RoleRequestValidator.cs. */
export function roleRequestValidators(L: Localizer<"RoleRequestValidator">): Record<string, ModelValidator> {
    return { name: (value) => (blank(value) ? L("Name is required") : null) };
}

/** UpdateProfileRequestValidator.cs. */
export function updateProfileRequestValidators(L: Localizer<"UpdateProfileRequestValidator">): Record<string, ModelValidator> {
    return {
        firstName: (value) => (blank(value) ? L("First Name is required") : null),
        lastName: (value) => (blank(value) ? L("Last Name is required") : null),
    };
}
