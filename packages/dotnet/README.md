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
- **File uploads.** An operation with a `multipart/form-data` body (an ASP.NET Core `IFormFile` or
  `IEnumerable<IFormFile>` parameter) takes a body type of its own, `<Operation>Form`, in the client file:
  - `format: binary` is a `Blob`, so a `File` from `<input type="file">` (or `InputFile`) goes in as it is;
  - the client sends a `FormData` built by `formData(fields)` and leaves the content type to the browser,
    which adds the boundary;
  - an array becomes one part per item, a file keeps its name, and null or undefined fields are left out.

  ```ts
  await client.fileUpload({ files: [...input.files] }, { folderId });
  ```
- **Schema ⇒ DataAnnotations.** Constraints from the schema are emitted as 3.6 decorators on the
  generated model *classes* (`@Required()`, `@MinLength`, `@MaxLength`, `@StringLength`,
  `@Range`, `@EmailAddress`, `@RegularExpression`) — EditContext +
  `DataAnnotationsValidator` validate with them out of the box.
- **Auth integration.** `CookieAuthenticationStateProvider` (session endpoint; `refresh()` asks
  again after a sign-in through the app's own form)
  and `JwtAuthenticationStateProvider` (local payload decoding, Microsoft claim URIs; override
  `createUserAsync` for roles the token doesn't carry) on top of the runtime's
  `AuthenticationStateProvider`; `attachJwtAuth` installs the `Authorization: Bearer` interceptor
  and logs out when the server answers the token with a 401, and with `{ refresh }` renews it before it expires (attach it after an interceptor that
  throws on error statuses, as .NET's handler chain is built). The cookie provider (the BFF pattern, token in an HttpOnly cookie) is the recommended
  default; JWT in the browser only with a stated reason, kept in memory — see [docs/auth.md](../../docs/auth.md).

## Nullability rules

| Schema | TS |
| --- | --- |
| `required`, not nullable | `T` (primitives with the .NET default: `""`, `0`, `false`, `[]`) |
| `required`, nullable | `T \| null = null` |
| optional, not nullable | `?: T` |
| optional, nullable | `?: T \| null` |

**In responses, value types are present.** Swashbuckle lists no `required` unless the C# code says
so, but ASP.NET Core writes every property (System.Text.Json's default). In a schema that appears
only in responses, these properties count as present:
- a property that isn't nullable and has a type: `Guid`, `int`, `bool`, `DateTime`, a non-nullable
  `string` or list;
- a property whose `$ref` points to an enum.

So `Guid Id` reads as `id = ""`, not `id?: string`. A `$ref` to an object keeps the schema's rule,
because OpenAPI 3.0 cannot mark it nullable. Schemas that are also request bodies keep the schema's
rules as well.

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
