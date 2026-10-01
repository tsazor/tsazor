/**
 * The validation demo's model: field decorators are the validation rules
 * (Tsazor's DataAnnotations pendant, roadmap 3.6).
 */
import { Compare, EmailAddress, MaxLength, Range, Required } from "@tsazor/runtime";

export class Profile {
  @Required() @MaxLength(80)
  name = "";

  @Required() @EmailAddress()
  email = "";

  @Compare("email")
  confirmEmail = "";

  @Range(18, 99)
  age = 18;
}