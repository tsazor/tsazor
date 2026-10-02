import { ComponentBase, Parameter } from "@tsazor/runtime";

/** The code-behind of Password.tsazor: state and logic, no markup. */
export default class PasswordBase extends ComponentBase {
    @Parameter() minLength = 10;

    password = "hunter2";

    private get rules(): Array<{ test: (value: string) => boolean; hint: string }> {
        return [
            { test: (value) => value.length >= this.minLength, hint: `Use at least ${this.minLength} characters.` },
            { test: (value) => /[A-Z]/.test(value) && /[a-z]/.test(value), hint: "Mix upper and lower case." },
            { test: (value) => /\d/.test(value), hint: "Add a number." },
            { test: (value) => /[^A-Za-z0-9]/.test(value), hint: "Add a symbol." },
        ];
    }

    protected get score(): number {
        return this.rules.filter((rule) => rule.test(this.password)).length;
    }

    protected get hints(): string[] {
        return this.rules.filter((rule) => !rule.test(this.password)).map((rule) => rule.hint);
    }

    protected get level(): "weak" | "fair" | "strong" {
        if (this.score <= 1) return "weak";
        return this.score < 4 ? "fair" : "strong";
    }

    protected get verdict(): string {
        switch (this.level) {
            case "weak": return "Weak — easy to guess.";
            case "fair": return "Fair — getting there.";
            case "strong": return "Strong. Nice.";
        }
    }
}
