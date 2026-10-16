/** The profile's fields the pane shows; the app's to extend. */
import { Required } from "@tsazor/runtime";

export class ProfileSettings {
  @Required() displayName: string | null = null;
  email: string | null = null;
}