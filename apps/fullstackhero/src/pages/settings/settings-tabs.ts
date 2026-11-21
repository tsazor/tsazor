import { MonitorSmartphone, Palette, ShieldCheck, UserRound, type IconNode } from "lucide";

// pages/settings/layout.tsx's tabs: the settings sections, in the left nav's order (numbered 01–04).

export type Tab = {
  to: string;
  label: string;
  hint: string;
  icon: IconNode;
};

export const TABS: Tab[] = [
  {
    to: "/settings/profile",
    label: "Profile",
    hint: "Your identity and avatar",
    icon: UserRound,
  },
  {
    to: "/settings/security",
    label: "Security",
    hint: "Password and two-factor auth",
    icon: ShieldCheck,
  },
  {
    to: "/settings/sessions",
    label: "Sessions",
    hint: "Active devices and sign-outs",
    icon: MonitorSmartphone,
  },
  {
    to: "/settings/appearance",
    label: "Appearance",
    hint: "Theme and visual preferences",
    icon: Palette,
  },
];

export const pad2 = (n: number) => n.toString().padStart(2, "0");
