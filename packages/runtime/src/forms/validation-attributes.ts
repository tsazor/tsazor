/**
 * Decorator-based validation rules — Tsazor's DataAnnotations pendant
 * (System.ComponentModel.DataAnnotations).
 *
 * Roadmap 3.6 decision (Empfehlung "Decorators"): validation rules are declared
 * on the model's fields with TC39 class-field decorators, so the `.tsazor`
 * markup stays Razor 1:1 (`@Required()`, `@MaxLength(80)`) and the rules live
 * on the model type — which keeps 5.2's OpenAPI ⇒ Validators mapping possible
 * (DataAnnotations from the schema decorate the generated model classes). The
 * function-based `validators` map (EditForm) remains as the adapter for logic
 * a schema cannot describe.
 *
 * Like @Parameter/@CascadingParameter, the decorators record into the class's
 * decorator metadata under a private key; readers walk the class chain (later
 * classes in the chain win). Every rule carries .NET's exact DataAnnotations
 * error message, formatted with the field name as the display name (Blazor:
 * the property's display name — Tsazor has no [Display] attribute port, so the
 * field name as written).
 *
 * E8 (design-localization.md §4, decision D-L7): messages localize three ways —
 * the reserved `tsazor.validation.<kind>` keys (override them once and every
 * built-in rule of that kind localizes), a per-rule `message`/`messageKey`
 * (Blazor's ErrorMessage / ErrorMessageResourceName analogue), or a
 * `messageFactory` for full control. `validate()` applies the rule's own
 * override and the built-in English text; the reserved-key/localizer-key
 * resolution happens in `resolveValidationMessage` (called by the
 * DataAnnotations validation pass, which holds the StringLocalizer).
 */
import { ensureDecoratorMetadata } from "../components/parameter-metadata.js";
import { formatMessage } from "../localization/string-localizer.js";

const METADATA: symbol = ensureDecoratorMetadata();
const RULES = Symbol("tsazor.validationRules");

/** The named values a failed rule's message carries (the ErrorMessage factory's argument). */
export interface ValidationMessageContext {
  /** The field name as written (the message's display name). */
  readonly displayName: string;
  /** Range/StringLength/MinLength: the bound (inclusive). */
  readonly min?: number;
  /** Range/StringLength/MaxLength: the bound (inclusive). */
  readonly max?: number;
  /** RegularExpression: the pattern as declared. */
  readonly pattern?: string;
  /** Compare: the other field's name. */
  readonly other?: string;
}

/** E8 (D-L7): how one rule's message can be overridden. */
export interface ValidationMessageOverride {
  /** Blazor's ErrorMessage: a fixed text for this rule. */
  readonly message?: string;
  /** ErrorMessageResourceName analogue: the localizer key (the localizer is the resource source). */
  readonly messageKey?: string;
  /** A per-call factory, e.g. `@Range(0, 10, { messageFactory: (ctx) => L.get("Order.Rating", ctx) })`. */
  readonly messageFactory?: (context: ValidationMessageContext) => string;
}

/** The named values the reserved `tsazor.validation.<kind>` keys receive as params. */
export interface ValidationRuleParams {
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: string;
  readonly other?: string;
}

/** One validation rule (one DataAnnotations attribute instance). */
export interface ValidationRule {
  /** Short kind name (for tests and tooling; also the reserved key `tsazor.validation.<kind>`). */
  readonly kind: string;
  /** E8: the named values for the reserved-key lookup ({displayName} is added at resolution). */
  readonly params: Readonly<ValidationRuleParams>;
  /** E8: this rule's message override. */
  readonly override?: ValidationMessageOverride;
  /**
   * Validates the field value; returns the validation message or null when the
   * value is valid. The message is the rule's override (`message` /
   * `messageFactory`) or the built-in English text, with the field name as the
   * display name (message placeholder {0}); the localizer-key forms resolve in
   * `resolveValidationMessage` (the validation pass holds the StringLocalizer).
   */
  validate(value: unknown, model: object, displayName: string): string | null;
}

/** .NET's Composite Formatting for the placeholders a rule uses ({0}…). */
function message(template: string, ...args: unknown[]): string {
  return template.replace(/\{(\d)\}/g, (_match, index: string) => String(args[Number(index)]));
}

/** .NET's RequiredAttribute.IsValid: null, and (without AllowEmptyStrings) whitespace-only strings are invalid. */
function requiredMessage(value: unknown, allowEmptyStrings: boolean, displayName: string): string | null {
  if (value === null || value === undefined) return message("The {0} field is required.", displayName);
  if (typeof value !== "string") return null;
  return value.trim().length === 0 && !allowEmptyStrings
    ? message("The {0} field is required.", displayName)
    : null;
}

/** The string-or-array length a length rule looks at (undefined: other types are not judged). */
function lengthOf(value: unknown): number | undefined {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.length;
  return undefined;
}

/**
 * RequiredAttribute: null/undefined and (unless allowEmptyStrings) whitespace-only
 * strings are invalid; other types are always valid.
 */
export function Required(options?: { allowEmptyStrings?: boolean } & ValidationMessageOverride): FieldRuleDecorator {
  const allowEmptyStrings = options?.allowEmptyStrings ?? false;
  return ruleDecorator({
    kind: "required",
    override: options,
    validate(value, _model, displayName) {
      return requiredMessage(value, allowEmptyStrings, displayName);
    },
  });
}

/** MinLengthAttribute: strings and arrays under the minimum length. */
export function MinLength(length: number, override?: ValidationMessageOverride): FieldRuleDecorator {
  return ruleDecorator({
    kind: "minLength",
    params: { min: length },
    override,
    validate(value, _model, displayName) {
      const size = lengthOf(value);
      return size !== undefined && size < length
        ? message("The field {0} must be a string or array type with a minimum length of '{1}'.", displayName, length)
        : null;
    },
  });
}

/** MaxLengthAttribute: strings and arrays over the maximum length. */
export function MaxLength(length: number, override?: ValidationMessageOverride): FieldRuleDecorator {
  return ruleDecorator({
    kind: "maxLength",
    params: { max: length },
    override,
    validate(value, _model, displayName) {
      const size = lengthOf(value);
      return size !== undefined && size > length
        ? message("The field {0} must be a string or array type with a maximum length of '{1}'.", displayName, length)
        : null;
    },
  });
}

/**
 * StringLengthAttribute: string length bounds. Other values are not judged
 * (deviation: .NET throws for them; Tsazor keeps validation total).
 */
export function StringLength(maximumLength: number, options?: { minimumLength?: number } & ValidationMessageOverride): FieldRuleDecorator {
  const includeMinimum = (options?.minimumLength ?? 0) > 0;
  const minimum = options?.minimumLength ?? 0;
  return ruleDecorator({
    kind: "stringLength",
    params: includeMinimum ? { min: minimum, max: maximumLength } : { max: maximumLength },
    override: options,
    validate(value, _model, displayName) {
      if (typeof value !== "string") return null;
      const tooLong = value.length > maximumLength;
      const tooShort = includeMinimum && value.length < minimum;
      if (!tooLong && !tooShort) return null;
      return includeMinimum
        ? message("The field {0} must be a string with a minimum length of {2} and a maximum length of {1}.", displayName, maximumLength, minimum)
        : message("The field {0} must be a string with a maximum length of {1}.", displayName, maximumLength);
    },
  });
}

/**
 * RangeAttribute: numeric values between min and max (inclusive). Other values
 * are not judged (deviation: .NET converts strings and throws on other types).
 */
export function Range(minimum: number, maximum: number, override?: ValidationMessageOverride): FieldRuleDecorator {
  return ruleDecorator({
    kind: "range",
    params: { min: minimum, max: maximum },
    override,
    validate(value, _model, displayName) {
      return typeof value === "number" && (value < minimum || value > maximum)
        ? message("The field {0} must be between {1} and {2}.", displayName, minimum, maximum)
        : null;
    },
  });
}

/**
 * EmailAddressAttribute (.NET 9+ structural check, not a regex): null is valid;
 * a non-string or any string with a line break is invalid; exactly one '@'
 * that is neither the first nor the last character.
 */
export function EmailAddress(override?: ValidationMessageOverride): FieldRuleDecorator {
  return ruleDecorator({
    kind: "emailAddress",
    override,
    validate(value, _model, displayName) {
      if (value === null || value === undefined) return null;
      // .NET: a non-string is invalid; the '@' must be single, inside, no line breaks.
      const text = typeof value === "string" ? value : null;
      const index = text === null ? -1 : text.indexOf("@");
      const valid =
        text !== null && !/[\r\n]/.test(text) && index > 0 && index !== text.length - 1 && index === text.lastIndexOf("@");
      return valid ? null : message("The {0} field is not a valid e-mail address.", displayName);
    },
  });
}

/**
 * RegularExpressionAttribute: non-null values must match the pattern as given
 * (.NET matches unanchored). Non-string values are stringified.
 */
export function RegularExpression(pattern: string, override?: ValidationMessageOverride): FieldRuleDecorator {
  return ruleDecorator({
    kind: "regularExpression",
    params: { pattern },
    override,
    validate(value, _model, displayName) {
      if (value === null || value === undefined) return null;
      return new RegExp(pattern).test(String(value))
        ? null
        : message("The field {0} must match the regular expression '{1}'.", displayName, pattern);
    },
  });
}

/** CompareAttribute: the value must equal (===) the other field's value. */
export function Compare(otherField: string, override?: ValidationMessageOverride): FieldRuleDecorator {
  return ruleDecorator({
    kind: "compare",
    params: { other: otherField },
    override,
    validate(value, model, displayName) {
      const other = (model as Record<string, unknown>)[otherField];
      return value === other
        ? null
        : message("'{0}' and '{1}' do not match.", displayName, otherField);
    },
  });
}

/** A TC39 class-field decorator (the only form the rule decorators accept). */
export type FieldRuleDecorator = (value: unknown, context: ClassFieldDecoratorContext) => void;

/**
 * E8 (design-localization.md §4, D-L7): the localized message for a failed
 * rule. Resolution order: the rule's `messageFactory`, the rule's `message`,
 * the localizer key — the rule's `messageKey` or the reserved
 * `tsazor.validation.<kind>` — formatted with `{displayName}` and the rule's
 * params, and finally the built-in English text (`validate`'s result). A
 * localizer is the structural `{ raw }` of StringLocalizer, so the forms
 * module stays free of a localization dependency.
 */
export function resolveValidationMessage(
  rule: ValidationRule,
  displayName: string,
  english: string,
  localizer?: { raw(key: string): string | undefined },
): string {
  const override = rule.override;
  if (override?.messageFactory !== undefined) return override.messageFactory({ displayName, ...rule.params });
  if (override?.message !== undefined) return override.message;
  const key = override?.messageKey ?? `tsazor.validation.${rule.kind}`;
  const localized = localizer?.raw(key);
  if (localized !== undefined) return formatMessage(localized, { displayName, ...rule.params });
  return english;
}

/** The own validation-rule list of a decorator metadata object. */
function ownRules(metadata: Record<PropertyKey, unknown>): Map<string, ValidationRule[]> {
  if (!Object.hasOwn(metadata, RULES)) metadata[RULES] = new Map<string, ValidationRule[]>();
  return metadata[RULES] as Map<string, ValidationRule[]>;
}

function ruleDecorator(spec: { kind: string; params?: ValidationRuleParams; override?: ValidationMessageOverride; validate: ValidationRule["validate"] }): FieldRuleDecorator {
  const rule: ValidationRule = {
    kind: spec.kind,
    params: spec.params ?? {},
    override: spec.override && (spec.override.message !== undefined || spec.override.messageKey !== undefined || spec.override.messageFactory !== undefined)
      ? spec.override
      : undefined,
    validate(value, model, displayName) {
      const english = spec.validate(value, model, displayName);
      if (english === null) return null;
      const override = rule.override;
      if (override?.messageFactory !== undefined) return override.messageFactory({ displayName, ...rule.params });
      if (override?.message !== undefined) return override.message;
      return english;
    },
  };
  return (_value, context) => {
    if (typeof context !== "object" || context === null || context.metadata == null) {
      // A legacy-call signature means the class was compiled with
      // experimentalDecorators (same message wording as @Parameter).
      throw new Error("Validation decorators are standard (TC39) decorators — remove \"experimentalDecorators\" from the tsconfig.");
    }
    if (context.static || context.private || typeof context.name !== "string") {
      throw new Error(`Validation decorators apply to public instance fields, not to '${String(context.name)}'.`);
    }
    // Field decorators run in declaration order before the field initializer —
    // a field can carry several rules (@Required() @MaxLength(80)) and they
    // are appended in the order they appear.
    const rules = ownRules(context.metadata as Record<PropertyKey, unknown>);
    if (!rules.has(context.name)) rules.set(context.name, []);
    rules.get(context.name)!.push(rule);
  };
}

/** All validation rules of a model type, walking the class chain (a re-declared field wins). */
export function validationRulesOf(modelType: unknown): ReadonlyMap<string, readonly ValidationRule[]> {
  const result = new Map<string, readonly ValidationRule[]>();
  const chain: unknown[] = [];
  let current = modelType;
  while (typeof current === "function" && current !== Object && current !== Function.prototype) {
    chain.unshift(current);
    current = Object.getPrototypeOf(current);
  }
  for (const cls of chain) {
    if (!Object.hasOwn(cls as object, METADATA)) continue;
    const metadata = (cls as unknown as Record<symbol, Record<PropertyKey, unknown> | null | undefined>)[METADATA];
    if (metadata == null || !Object.hasOwn(metadata, RULES)) continue;
    for (const [field, rules] of metadata[RULES] as Map<string, ValidationRule[]>) {
      // The language invokes TC39 decorators bottom-up; the rules are read in
      // declaration (source) order — .NET's GetCustomAttributes order.
      result.set(field, [...rules].reverse());
    }
  }
  return result;
}

/** Predefined: the rules a model type declares for one field (empty when none). */
export function rulesForField(model: object, field: string): readonly ValidationRule[] {
  return validationRulesOf((model as object).constructor).get(field) ?? [];
}