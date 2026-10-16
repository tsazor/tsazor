/** The sign-in's fields, as the rules validate them; the app's to extend (rememberMe, tenant, …). */
import { Required } from "@tsazor/runtime";

export class LoginCredentials {
  @Required() email: string | null = null;
  @Required() password: string | null = null;
}