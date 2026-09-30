/**
 * B7: route table ordering (Blazor's RouteTableFactory.RouteComparison),
 * template parsing errors (TemplateParser) and each route constraint.
 */
import { describe, expect, it } from "vitest";
import { matchRoute, parseRouteTemplate, RouteTable, type RouteEntry } from "../src/index";

class A {}
class B {}
class C {}
class D {}

const table = (...entries: [string, abstract new () => unknown][]): RouteEntry[] => entries.map(([template, type]) => ({ template, type }));
const order = (entries: RouteEntry[]) => RouteTable.create(entries).entries.map((e) => e.route.template);

describe("route table ordering", () => {
  it("literal < constrained parameter < parameter < constrained catch-all < catch-all", () => {
    const entries = table(["/x/{*rest}", A], ["/x/{*rest:alpha}", B], ["/x/{p}", C], ["/x/{p:int}", D], ["/x/lit", A]);
    expect(order(entries)).toEqual(["/x/lit", "/x/{p:int}", "/x/{p}", "/x/{*rest:alpha}", "/x/{*rest}"]);
    expect(matchRoute(entries, "/x/lit")?.route.template).toBe("/x/lit");
    expect(matchRoute(entries, "/x/5")?.route.template).toBe("/x/{p:int}");
    expect(matchRoute(entries, "/x/five")?.route.template).toBe("/x/{p}");
    expect(matchRoute(entries, "/x/a/b")?.route.template).toBe("/x/{*rest:alpha}");
    expect(matchRoute(entries, "/x/a/5")?.route.template).toBe("/x/{*rest}");
  });

  it("compares left to right: an earlier literal wins over later ones", () => {
    const entries = table(["/{a}/b", A], ["/a/{b}", B]);
    expect(order(entries)).toEqual(["/a/{b}", "/{a}/b"]);
    expect(matchRoute(entries, "/a/b")?.route.type).toBe(B);
    expect(matchRoute(entries, "/z/b")?.route.type).toBe(A);
  });

  it("on a tie the route with fewer segments comes first", () => {
    const entries = table(["/o/{id?}", A], ["/o", B]);
    expect(order(entries)).toEqual(["/o", "/o/{id?}"]);
    expect(matchRoute(entries, "/o")?.route.type).toBe(B);
    expect(matchRoute(entries, "/o/1")?.route.type).toBe(A);
  });

  it("equal precedence with different literals or constraints keeps manifest order (not ambiguous)", () => {
    expect(order(table(["/b", A], ["/a", B]))).toEqual(["/b", "/a"]);
    const entries = table(["/v/{x:int}", A], ["/v/{x:bool}", B]);
    expect(matchRoute(entries, "/v/1")?.route.type).toBe(A);
    expect(matchRoute(entries, "/v/true")?.route.type).toBe(B);
  });

  it("ambiguous routes throw with both templates and components", () => {
    expect(() => RouteTable.create(table(["/p/{x:int}", A], ["/q", C], ["/P/{y:INT}", B]))).toThrow(
      "The following routes are ambiguous:\n'/p/{x:int}' in 'A'\n'/P/{y:INT}' in 'B'\n",
    );
    expect(() => RouteTable.create(table(["/", A], ["", B]))).toThrow(/ambiguous/);
    expect(() => RouteTable.create(table(["/c/{*a}", A], ["/c/{**b}", B]))).toThrow(/ambiguous/);
  });

  it("parameters of the page's other @page templates are reset to null", () => {
    const entries = table(["/item/{id:int}", A], ["/item/{id:int}/{tab}", A], ["/other/{name}", B]);
    expect(matchRoute(entries, "/item/3")?.values).toEqual({ id: 3, tab: null });
    expect(matchRoute(entries, "/item/3/info")?.values).toEqual({ id: 3, tab: "info" });
    expect(matchRoute(entries, "/other/x")?.values).toEqual({ name: "x" });
  });
});

describe("matching", () => {
  it("is case-insensitive for literals, ignores query/hash and trailing slashes", () => {
    const entries = table(["/Counter", A]);
    expect(matchRoute(entries, "/counter/?x=1#top")?.route.type).toBe(A);
    expect(matchRoute(entries, "counter")?.route.type).toBe(A);
    expect(matchRoute(entries, "/counter/extra")).toBeNull();
  });

  it("decodes segments except %2F", () => {
    const entries = table(["/s/{name}", A]);
    expect(matchRoute(entries, "/s/a%20b")?.values.name).toBe("a b");
    expect(matchRoute(entries, "/s/a%2Fb")?.values.name).toBe("a%2Fb");
    expect(matchRoute(entries, "/s/%E0%A4%A")?.values.name).toBe("%E0%A4%A");
  });

  it("optional parameters: {name?} and {id:int?}, several at the end", () => {
    const entries = table(["/opt/{a?}/{b:int?}", A]);
    expect(matchRoute(entries, "/opt")?.values).toEqual({ a: null, b: null });
    expect(matchRoute(entries, "/opt/x")?.values).toEqual({ a: "x", b: null });
    expect(matchRoute(entries, "/opt/x/2")?.values).toEqual({ a: "x", b: 2 });
    expect(matchRoute(entries, "/opt/x/y")).toBeNull();
  });

  it("catch-all: {*path} and {**path} take the decoded rest, empty ⇒ null", () => {
    const entries = table(["/files/{*path}", A], ["/docs/{**path}", B]);
    expect(matchRoute(entries, "/files/a/b%20c/d")?.values.path).toBe("a/b c/d");
    expect(matchRoute(entries, "/docs/x/y")?.values.path).toBe("x/y");
    expect(matchRoute(entries, "/files")?.values.path).toBeNull();
  });

  it("constrained catch-all checks every segment", () => {
    const entries = table(["/n/{*nums:int}", A]);
    expect(matchRoute(entries, "/n/1/2/3")?.values.nums).toBe("1/2/3");
    expect(matchRoute(entries, "/n/1/x")).toBeNull();
  });
});

describe("constraints", () => {
  const value = (constraint: string, raw: string) => matchRoute(table([`/c/{v:${constraint}}`, A]), `/c/${raw}`)?.values.v;
  const NONE = undefined;

  it("int: 32-bit range, optional sign", () => {
    expect(value("int", "42")).toBe(42);
    expect(value("int", "-7")).toBe(-7);
    expect(value("int", "+7")).toBe(7);
    expect(value("int", "2147483647")).toBe(2147483647);
    expect(value("int", "2147483648")).toBe(NONE);
    expect(value("int", "1.5")).toBe(NONE);
    expect(value("int", "12abc")).toBe(NONE);
  });

  it("long: bigint, 64-bit range", () => {
    expect(value("long", "42")).toBe(42n);
    expect(value("long", "-9223372036854775808")).toBe(-9223372036854775808n);
    expect(value("long", "-9223372036854775809")).toBe(NONE);
    expect(value("long", "x")).toBe(NONE);
  });

  it("bool: case-insensitive, anchored", () => {
    expect(value("bool", "true")).toBe(true);
    expect(value("bool", "FALSE")).toBe(false);
    expect(value("bool", "truex")).toBe(NONE);
    expect(value("bool", "1")).toBe(NONE);
  });

  it("double / float: decimal point, exponent, thousands separators", () => {
    expect(value("double", "1.5")).toBe(1.5);
    expect(value("double", "-2e3")).toBe(-2000);
    expect(value("double", "1,000.25")).toBe(1000.25);
    expect(value("double", ".5")).toBe(0.5);
    expect(value("double", "abc")).toBe(NONE);
    expect(value("double", "1.2.3")).toBe(NONE);
    expect(value("float", "0.1")).toBe(Math.fround(0.1));
    expect(value("float", "x1")).toBe(NONE);
  });

  it("decimal: no exponent", () => {
    expect(value("decimal", "19.99")).toBe(19.99);
    expect(value("decimal", "1e3")).toBe(NONE);
  });

  it("datetime: ISO date / date-time ⇒ Date", () => {
    expect(value("datetime", "2024-03-15")).toEqual(new Date(2024, 2, 15));
    expect(value("datetime", "2024-03-15T10:30")).toEqual(new Date(2024, 2, 15, 10, 30));
    expect(value("datetime", "2024-03-15T10:30:05Z")).toEqual(new Date(Date.UTC(2024, 2, 15, 10, 30, 5)));
    expect(value("datetime", "2024-03-15T10:30:00+02:00")).toEqual(new Date(Date.UTC(2024, 2, 15, 8, 30)));
    expect(value("datetime", "2024-02-30")).toBe(NONE);
    expect(value("datetime", "yesterday")).toBe(NONE);
  });

  it("guid: D, N, B, P formats", () => {
    expect(value("guid", "0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(value("guid", "0f8fad5bd9cb469fa16570867728950e")).toBe("0f8fad5bd9cb469fa16570867728950e");
    expect(value("guid", "%7B0f8fad5b-d9cb-469f-a165-70867728950e%7D")).toBe("{0f8fad5b-d9cb-469f-a165-70867728950e}");
    expect(value("guid", "(0f8fad5b-d9cb-469f-a165-70867728950e)")).toBe("(0f8fad5b-d9cb-469f-a165-70867728950e)");
    expect(value("guid", "0f8fad5b-d9cb-469f-a165")).toBe(NONE);
  });

  it("alpha / alphaNumeric", () => {
    expect(value("alpha", "Abc")).toBe("Abc");
    expect(value("alpha", "ab1")).toBe(NONE);
    expect(value("alphaNumeric", "ab1")).toBe("ab1");
    expect(value("alphanumeric", "ab-1")).toBe(NONE);
  });

  it("regex(...): anchored, grouped, case-insensitive, {{ }} escapes", () => {
    expect(value("regex(a|b)", "A")).toBe("A");
    expect(value("regex(a|b)", "ab")).toBe(NONE);
    expect(value("regex(^\\d{{3}}$)", "123")).toBe("123");
    expect(value("regex(^\\d{{3}}$)", "1234")).toBe(NONE);
  });

  it("several constraints must all match; the typed one converts", () => {
    expect(value("int:regex(1\\d*)", "12")).toBe(12);
    expect(value("int:regex(1\\d*)", "22")).toBe(NONE);
  });
});

describe("template errors (TemplateParser)", () => {
  const error = (template: string) => () => parseRouteTemplate(template);

  it("rejects malformed templates", () => {
    expect(error("/a//b")).toThrow("Invalid template '/a//b'. Empty segments are not allowed.");
    expect(error("/a/b}")).toThrow("Missing '{' in parameter segment 'b}'");
    expect(error("/a/{b")).toThrow("Missing '}' in parameter segment '{b'");
    expect(error("/a/{}")).toThrow("Empty parameter name");
    expect(error("/a/{b.c}")).toThrow("The character '.' in parameter segment '{b.c}' is not allowed.");
    expect(error("/{*rest}/x")).toThrow("A catch-all parameter can only appear as the last segment");
    expect(error("/{a?}/x")).toThrow("Non-optional parameters or literal routes cannot appear after optional parameters.");
    expect(error("/{a}/{A}")).toThrow("The parameter 'a' appears multiple times.");
    expect(error("/{*a?}")).toThrow("contains both an optional and a catch-all parameter");
    expect(error("/{a:nope}")).toThrow("Unsupported constraint 'nope'");
  });

  it("an optional parameter may be followed by a catch-all", () => {
    expect(parseRouteTemplate("/{a?}/{*rest}").segments.map((s) => s.value)).toEqual(["a", "rest"]);
  });
});
