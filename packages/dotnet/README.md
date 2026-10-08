# @tsazor/dotnet

The official bridge between Tsazor frontends and .NET backends (roadmap 5.2) —
*one way instead of three app-specific ones* (review 7.3: Sleipnir, FluentCMS and Pizza each
ran their own HTTP helpers).

## What's included

- **OpenAPI ⇒ typed TS client.** Local generation from an ASP.NET Core OpenAPI document
  (Swashbuckle/NSwag, JSON — 3.0/3.1):
  `tsazor-dotnet generate <openapi.json|url> --out <dir>` writes
  `models.ts` and `<Name>Client.ts`. Entry points: `.` is browser-safe
  (client/HttpResult/auth, no Node modules), `@tsazor/dotnet/generator`
  is the Node-side part (OpenAPI reading, generation, CLI).
- **`HttpResult<T>` instead of throwing.** On `!ok` the client does not throw before the body
  can be read: RFC 9457 ProblemDetails and ValidationProblemDetails
  (`errors: Record<string, string[]>`) are values on the result.
- **Envelope unwrapping.** APIs that wrap responses in `{ data: T, errors: [...] }`
  (FluentCMS style) are supported with `--envelope data,errors`:
  - the generated return type is the envelope's `data`, the same value the client returns as `body`;
  - a non-empty envelope error turns a 2xx into an `ok:false` result;
  - on an error status, the envelope's errors become the message, unless the body is a ProblemDetails
    with a `title` or `detail`;
  - an error object such as `{ code, description }` reads as its text, or as its code when the text
    is empty.
- **Method names.** A method is named after its operation's `operationId`. Swashbuckle's default
  emits none. Then the name comes from the path, without the `api`/`v1` prefix:
  - `POST /api/User/Create` becomes `userCreate`;
  - names that collide get the HTTP method (`getOrders`, `postOrders`), and then the path
    parameters (`getOrdersById`);
  - one warning names the fix: set operationIds on the server (Swashbuckle: `CustomOperationIds`).
- **Schema ⇒ DataAnnotations.** Constraints from the schema are emitted as 3.6 decorators on the
  generated model *classes* (`@Required()`, `@MinLength`, `@MaxLength`, `@StringLength`,
  `@Range`, `@EmailAddress`, `@RegularExpression`) — EditContext +
  `DataAnnotationsValidator` validate with them out of the box.
- **Auth integration.** `CookieAuthenticationStateProvider` (session endpoint)
  and `JwtAuthenticationStateProvider` (local payload decoding, Microsoft claim URIs) on top of
  the runtime's `AuthenticationStateProvider`;
  `attachJwtAuth` installs the `Authorization: Bearer` interceptor. The cookie provider (the BFF
  pattern, token in an HttpOnly cookie) is the recommended default; JWT in the browser only with a
  stated reason, kept in memory — see [docs/auth.md](../../docs/auth.md).

## Nullability rules

| Schema | TS |
| --- | --- |
| `required`, not nullable | `T` (primitives with the .NET default: `""`, `0`, `false`, `[]`) |
| `required`, nullable | `T \| null = null` |
| optional, not nullable | `?: T` |
| optional, nullable | `?: T \| null` |

Documented subset (the deviations are intentional):

- `integer`/`number`/`int64` ⇒ `number` — JS has one number format; the Int64 precision limit
  is the same as with `openapi-typescript`.
- `Range` only when both `minimum` **and** `maximum` are set (DataAnnotations requires two
  bounds).
- Inline objects without `$ref` ⇒ `Record<string, unknown>` (with a generator warning);
  `additionalProperties` fields are mapped to `Record<string, T>`.
- `@Required()` on strings and object references (the .NET semantics of RequiredAttribute);
  numbers/booleans get their initial value and don't need it.
- YAML is not read (JSON documents and URLs only).

## Usage

```sh
npx tsazor-dotnet generate openapi.json --out src/api --name ContosoOrders
# with an envelope and a fixed base URL:
npx tsazor-dotnet generate https://my.app/swagger/v1/swagger.json \
    --out src/api --envelope data,errors --base-url https://my.app
```

```ts
import { ContosoOrdersClient } from "./api/contoso-orders.js";

const client = new ContosoOrdersClient(new TsazorHttp()); // or the baseUrl default from --base-url
const result = await client.getOrder(1);
if (result.ok) {
    // result.body: OrderDto
} else {
    // result.problem: ProblemDetails | null; result.validationErrors?
    console.error(problemMessage(result));
}
```

The generated files are GENERATED CODE (header line in the file); they belong in version
control, so the build pipeline no longer needs .NET.

## Testing without a .NET backend

The package tests exercise ProblemDetails/envelope handling against a small Node HTTP server
(`node:http`) and check the generated output with a real TypeScript run (`tsc`) against the
package types.
