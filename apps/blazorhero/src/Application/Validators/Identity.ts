import type { ModelValidator } from "@tsazor/runtime";
import type { Localizer } from "../../i18n";

/**
 * Application/Validators/Requests/Identity/TokenRequestValidator.cs (FluentValidation) as EditForm validators: per
 * field, the message of its first failing rule. FluentValidation's EmailAddress() checks what ASP.NET Core's
 * [EmailAddress] does: one "@", neither first nor last.
 */
export function tokenRequestValidators(L: Localizer<"TokenRequestValidator">): Record<string, ModelValidator> {
    return {
        email: (value) => {
            const text = typeof value === "string" ? value : "";
            if (text.trim() === "") return L("Email is required");
            return isEmailAddress(text) ? null : L("Email is not correct");
        },
        password: (value) => (typeof value === "string" && value.trim() !== "" ? null : L("Password is required!")),
    };
}

function isEmailAddress(text: string): boolean {
    const at = text.indexOf("@");
    return at > 0 && at === text.lastIndexOf("@") && at < text.length - 1;
}
