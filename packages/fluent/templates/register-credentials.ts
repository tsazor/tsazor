/** The register's fields, as the rules validate them; the app's to extend. */
import { Compare, EmailAddress, MinLength, Required } from "@tsazor/runtime";

export class RegisterCredentials {
  @Required() displayName: string | null = null;
  @Required() @EmailAddress() email: string | null = null;
  @Required() @MinLength(8) password: string | null = null;
  @Required() @Compare("password") confirm: string | null = null;
}