import { cva, type VariantProps } from "class-variance-authority";

// The original's class-variance-authority definitions (components/ui/button.tsx, badge.tsx), unchanged: cva is
// framework-free. The components use them, and so does markup that styles a link as a button (the original's
// `<Button asChild><Link …/></Button>`: `<NavLink class="@buttonVariants({ variant: "outline" })">`).

/**
 * Button — FSH unified design system.
 *
 * Variants (preserved + extended):
 *   • default     — solid primary brand fill with hover lift shadow.
 *   • signal      — maps to primary (was Console chartreuse; kept for admin call-site compat).
 *   • destructive — danger tone.
 *   • outline     — hairline border, transparent fill.
 *   • secondary   — filled secondary surface.
 *   • ghost       — text-only, hover surfaces the accent background.
 *   • link        — inline text link with underline.
 *   • soft        — primary-soft tinted background.
 *   • saffron     — saffron accent (warm second channel).
 */
export const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md text-sm font-medium font-sans tracking-tight",
    "transition-all duration-[var(--duration-fast)] ease-[var(--ease-out-cubic)]",
    "outline-none focus-visible:ring-[3px] focus-visible:ring-[oklch(from_var(--color-ring)_l_c_h_/_0.5)] focus-visible:border-[var(--color-ring)]",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    "active:scale-[0.98]",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:brightness-[1.05] hover:shadow-[0_4px_18px_-6px_oklch(from_var(--color-primary)_l_c_h_/_0.45)]",
        // `signal` kept for admin call-site compat — maps to primary.
        signal:
          "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:brightness-[1.05] hover:shadow-[0_4px_18px_-6px_oklch(from_var(--color-primary)_l_c_h_/_0.45)]",
        destructive:
          "bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] hover:brightness-[1.05]",
        outline: [
          "border border-[var(--color-input)] bg-[var(--color-card)] text-[var(--color-foreground)] shadow-xs",
          "hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
        ].join(" "),
        secondary:
          "bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] hover:opacity-90",
        ghost:
          "text-[var(--color-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
        link: "text-[var(--color-primary)] underline-offset-4 hover:underline",
        soft: "bg-[var(--color-primary-soft)] text-[var(--color-primary)] hover:brightness-[1.06]",
        saffron:
          "bg-[var(--color-saffron)] text-[var(--color-saffron-foreground)] hover:brightness-[1.05] hover:shadow-[0_4px_18px_-6px_oklch(from_var(--color-saffron)_l_c_h_/_0.45)]",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-7 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

// The original's ButtonProps take VariantProps<typeof buttonVariants>. Tsazor's compiler decides from a parameter's
// declared type whether an attribute's text is a string (`variant="outline"`) and reads that type without the
// type checker, so a computed type (VariantProps<…>["variant"]) counts as a value and the text as an expression
// (port-fullstackhero.md, F1). The unions are written out, and checked against cva's below.
export type ButtonVariant = "default" | "signal" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "soft" | "saffron";
export type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

/**
 * Badge — compact status pill. Variants map to semantic tokens so a
 * brand re-tone propagates without touching call sites. The `soft`
 * style uses the matching `*-soft` background where defined and falls
 * back to a tinted layer otherwise.
 *
 * Admin-specific variant `muted` is preserved for call-site compat.
 */
export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-tight whitespace-nowrap",
  {
    variants: {
      variant: {
        default:
          "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]",
        brand:
          "border-transparent bg-[var(--color-primary-soft)] text-[var(--color-primary)]",
        // `muted` kept for admin call-site compat.
        muted:
          "border-transparent bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
        success:
          "border-transparent bg-[oklch(from_var(--color-success)_l_c_h_/_0.14)] text-[var(--color-success)]",
        warning:
          "border-transparent bg-[oklch(from_var(--color-warning)_l_c_h_/_0.16)] text-[var(--color-warning)]",
        info:
          "border-transparent bg-[oklch(from_var(--color-info)_l_c_h_/_0.14)] text-[var(--color-info)]",
        danger:
          "border-transparent bg-[oklch(from_var(--color-destructive)_l_c_h_/_0.14)] text-[var(--color-destructive)]",
        outline:
          "border-[var(--color-border-strong)] bg-transparent text-[var(--color-muted-foreground)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeVariant = "default" | "brand" | "muted" | "success" | "warning" | "info" | "danger" | "outline";

/** The written-out unions are exactly cva's variants (a compile error otherwise). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const variantsMatch: [
  Same<ButtonVariant, NonNullable<VariantProps<typeof buttonVariants>["variant"]>>,
  Same<ButtonSize, NonNullable<VariantProps<typeof buttonVariants>["size"]>>,
  Same<BadgeVariant, NonNullable<VariantProps<typeof badgeVariants>["variant"]>>,
] = [true, true, true];

/**
 * Input — h-9 hairline-bordered field with a 3px brand-tinted focus
 * ring. Sits on transparent so it inherits the surface it's placed on
 * (card vs. canvas); in dark mode picks up a faint input tint so
 * inputs read as recessed wells on graphite. No floating-label
 * monster — labels live above the field as plain <Label>s.
 *
 * (components/ui/input.tsx's classes, for the Input component and for raw <input>s styled as it.)
 */
export const inputClass = [
  "h-9 w-full min-w-0 rounded-lg border border-[var(--color-input)] bg-transparent px-3 py-1",
  "text-sm shadow-xs outline-none",
  "transition-[color,box-shadow,border-color,background-color] duration-[var(--duration-fast)] ease-[var(--ease-out-cubic)]",
  "selection:bg-[var(--color-primary)] selection:text-[var(--color-primary-foreground)]",
  "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--color-foreground)]",
  "placeholder:text-[var(--color-muted-foreground)]",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  "md:text-sm",
  "dark:bg-[oklch(from_var(--color-input)_l_c_h_/_0.3)]",
  "focus-visible:border-[var(--color-ring)] focus-visible:ring-[3px] focus-visible:ring-[oklch(from_var(--color-ring)_l_c_h_/_0.5)]",
  "aria-invalid:border-[var(--color-destructive)] aria-invalid:ring-[oklch(from_var(--color-destructive)_l_c_h_/_0.2)]",
].join(" ");
