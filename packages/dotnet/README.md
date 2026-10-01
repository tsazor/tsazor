# @tsazor/dotnet

Die offizielle Brücke zwischen Tsazor-Frontends und .NET-Backends (Roadmap 5.2) —
*nur ein Weg statt drei App-eigener* (Review 7.3: Sleipnir, FluentCMS und Pizza
betrieben jeweils eigene HTTP-Helfer).

## Was drin ist

- **OpenAPI ⇒ typisierter TS-Client.** Lokale Generierung aus einem
  ASP.NET-Core-OpenAPI-Dokument (Swashbuckle/NSwag, JSON — 3.0/3.1):
  `tsazor-dotnet generate <openapi.json|url> --out <dir>` schreibt
  `models.ts` und `<Name>Client.ts`. Einstiege: `.` ist browser-safe
  (Client/HttpResult/Auth, keine Node-Module), `@tsazor/dotnet/generator`
  ist der Node-seitige Teil (OpenAPI-Lesen, Generierung, CLI).
- **`HttpResult<T>` statt throw.** Der Client wirft bei `!ok` nicht, bevor der
  Körper lesbar ist: RFC-9457-ProblemDetails und ValidationProblemDetails
  (`errors: Record<string, string[]>`) sind Werte auf dem Resultat.
- **Envelope-Entpackung.** APIs, die `{ data: T, errors: [...] }` umschlagen
  (FluentCMS-Stil), werden mit `--envelope data,errors` unterstützt; ein
  nicht-leerer Envelope-Fehler macht aus einem 2xx ein `ok:false`-Resultat.
- **Schema ⇒ DataAnnotations.** Constraints aus dem Schema werden als
  3.6-Decorators auf die generierten Modell-*Klassen* emittiert
  (`@Required()`, `@MinLength`, `@MaxLength`, `@StringLength`,
  `@Range`, `@EmailAddress`, `@RegularExpression`) — EditContext +
  `DataAnnotationsValidator` validieren damit sofort.
- **Auth-Integration.** `CookieAuthenticationStateProvider` (Session-Endpunkt)
  und `JwtAuthenticationStateProvider` (lokale Payload-Dekodierung, Microsoft-
  Claim-URIs) auf dem Runtime-`AuthenticationStateProvider`;
  `attachJwtAuth` setzt den `Authorization: Bearer`-Interceptor.

## Nullability-Regeln

| Schema | TS |
| --- | --- |
| `required`, nicht nullable | `T` (Primitive mit .NET-Default: `""`, `0`, `false`, `[]`) |
| `required`, nullable | `T \| null = null` |
| optional, nicht nullable | `?: T` |
| optional, nullable | `?: T \| null` |

Dokumentierte Teilmenge (Abweichungen sind Absicht):

- `integer`/`number`/`int64` ⇒ `number` — JS hat ein Zahlformat; die
  Int64-Präzisionsgrenze ist dieselbe wie bei `openapi-typescript`.
- `Range` nur, wenn `minimum` **und** `maximum` gesetzt sind (DataAnnotations
  verlangt zwei Grenzen).
- Inline-Objekte ohne `$ref` ⇒ `Record<string, unknown>` (mit Generator-Warnung);
  `additionalProperties`-Felder werden als `Record<string, T>` gemappt.
- `@Required()` an Strings und Objekt-Referenzen (die .NET-Semantik des
  RequiredAttribute); Zahlen/Booleans bekommen den Initialwert und brauchen es nicht.
- YAML wird nicht gelesen (JSON-Dokumente und URLs).

## Benutzung

```sh
npx tsazor-dotnet generate openapi.json --out src/api --name ContosoOrders
# mit Envelope und fester Basis-URL:
npx tsazor-dotnet generate https://meine.app/swagger/v1/swagger.json \
    --out src/api --envelope data,errors --base-url https://meine.app
```

```ts
import { ContosoOrdersClient } from "./api/contoso-orders.js";

const client = new ContosoOrdersClient(new TsazorHttp()); // oder baseUrl-Default aus --base-url
const result = await client.getOrder(1);
if (result.ok) {
    // result.body: OrderDto
} else {
    // result.problem: ProblemDetails | null; result.validationErrors?
    console.error(problemMessage(result));
}
```

Die generierten Dateien sind GENERATED CODE (Kopfzeile im File); sie gehören in
die Versionskontrolle, sodass die Build-Pipeline kein .NET mehr braucht.

## Testen ohne .NET-Backend

Die Paket-Tests fahren ProblemDetails/Envelope über einen kleinen Node-HTTP-Server
(`node:http`) und prüfen den generierten Output mit einem echten TypeScript-Durchlauf
(`tsc`) gegen die Paket-Typen.