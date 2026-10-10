/**
 * The demo pages' icons, from the set of this build's skin: Fluent System Icons for Fluent, Bootstrap Icons for
 * Bootstrap. One Fluent module (`regular/size20`) keeps the dev server's start light; the Icons page browses the
 * whole set.
 */
import * as BootstrapIcons from "@tsazor/bootstrap-icons";
import * as Size20 from "@tsazor/fluent-icons/regular/size20";
import type { IconValue } from "@tsazor/ui";
import { skin } from "./skin";

export interface DemoIcons {
  readonly add: IconValue;
  readonly delete: IconValue;
  readonly folder: IconValue;
  readonly more: IconValue;
  readonly print: IconValue;
  readonly save: IconValue;
  readonly settings: IconValue;
  readonly star: IconValue;
}

export const icons: DemoIcons = skin === "fluent"
  ? {
    add: Size20.Add,
    delete: Size20.Delete,
    folder: Size20.Folder,
    more: Size20.ChevronDown,
    print: Size20.Print,
    save: Size20.Save,
    settings: Size20.Settings,
    star: Size20.Star,
  }
  : {
    add: BootstrapIcons.PlusLg,
    delete: BootstrapIcons.Trash,
    folder: BootstrapIcons.Folder,
    more: BootstrapIcons.ChevronDown,
    print: BootstrapIcons.Printer,
    save: BootstrapIcons.Floppy,
    settings: BootstrapIcons.Gear,
    star: BootstrapIcons.Star,
  };
