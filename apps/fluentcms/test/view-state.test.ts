import { afterEach, describe, expect, it } from "vitest";
import { NavigationManager } from "@tsazor/runtime";
import type { HttpResult } from "@tsazor/dotnet";
import type { FluentCmsClient } from "../src/api/fluent-cms";
import type { PageFullDetailResponse, PageParentDetailResponse } from "../src/api/models";
import { ViewState } from "../src/ViewState";

const ADMINS = "role-admins";

/** A page as Page/GetByUrl returns it: the admin roles page, one plugin, the given user. */
function adminPage(roleIds: string[], isSuperAdmin = false): PageFullDetailResponse {
    return {
        id: "page-roles",
        createdAt: "",
        siteId: "site",
        order: 0,
        title: "Roles",
        locked: true,
        site: { id: "site", createdAt: "", layoutId: "", detailLayoutId: "", editLayoutId: "", adminRoleIds: [ADMINS], contributorRoleIds: [] },
        layout: { id: "l1", createdAt: "", siteId: "site", name: "AdminLayout" },
        sections: { Main: [{ id: "p1", createdAt: "", siteId: "site", definitionId: "d1", pageId: "page-roles", order: 0, cols: 12, colsMd: 0, colsLg: 0, locked: false, section: "Main" }] },
        adminRoleIds: [ADMINS],
        viewRoleIds: [ADMINS],
        user: { isAuthenticated: true, isSuperAdmin, userId: "u1", roles: roleIds.map((id) => ({ id, createdAt: "", siteId: "site", usersCount: 0 })) },
    } as PageFullDetailResponse;
}

function ok(body: PageParentDetailResponse): HttpResult<PageParentDetailResponse> {
    return { ok: true, status: 200, body, headers: new Headers(), response: new Response() };
}

/** A client whose Page/GetByUrl answers with `answer(url)`. */
function client(answer: (url: string) => Promise<HttpResult<PageParentDetailResponse>>): FluentCmsClient {
    return { pageGetByUrl: (query?: { url?: string }) => answer(query?.url ?? "") } as unknown as FluentCmsClient;
}

afterEach(() => history.replaceState(null, "", "/"));

describe("ViewState", () => {
    it("resolves the URL's page, and the user's access through the site's admin roles", async () => {
        history.replaceState(null, "", "/admin/roles");
        const admin = new ViewState(client(async () => ok({ current: adminPage([ADMINS]) } as PageParentDetailResponse)), new NavigationManager());
        await admin.reload();
        expect([admin.loaded, admin.page.title, admin.layout?.name, admin.plugins.map((p) => p.id)]).toEqual([true, "Roles", "AdminLayout", ["p1"]]);
        expect([admin.site.hasAdminAccess, admin.page.hasAdminAccess, admin.page.hasViewAccess]).toEqual([true, true, true]);

        const guest = new ViewState(client(async () => ok({ current: adminPage([]) } as PageParentDetailResponse)), new NavigationManager());
        await guest.reload();
        expect([guest.site.hasAdminAccess, guest.page.hasViewAccess]).toEqual([false, false]);

        const superAdmin = new ViewState(client(async () => ok({ current: adminPage([], true) } as PageParentDetailResponse)), new NavigationManager());
        await superAdmin.reload();
        expect(superAdmin.page.hasViewAccess).toBe(true);
    });

    it("a plugin's view comes from ?pluginId and ?viewName (detail with ?viewMode=detail)", async () => {
        history.replaceState(null, "", "/admin/roles?pluginId=p1&viewName=Update%20Role");
        const state = new ViewState(client(async () => ok({ current: adminPage([ADMINS]) } as PageParentDetailResponse)), new NavigationManager());
        await state.reload();
        expect([state.type, state.plugin?.id, state.pluginViewName]).toEqual(["pluginEdit", "p1", "Update Role"]);

        history.replaceState(null, "", "/admin/roles?pluginId=p1&viewName=View&viewMode=detail");
        await state.reload();
        expect(state.type).toBe("pluginDetail");

        history.replaceState(null, "", "/admin/roles?pluginId=unknown&viewName=View");
        await state.reload();
        expect([state.type, state.plugin]).toEqual(["default", undefined]);
    });

    it("loads again on every navigation, tells its subscribers, and the newest navigation wins", async () => {
        history.replaceState(null, "", "/admin/roles");
        const pending = new Map<string, (result: HttpResult<PageParentDetailResponse>) => void>();
        const navigation = new NavigationManager();
        const state = new ViewState(client((url) => new Promise((resolve) => pending.set(new URL(url).pathname, resolve))), navigation);
        let notified = 0;
        state.subscribe(() => notified++);

        navigation.navigateTo("/admin/users");
        navigation.navigateTo("/admin/sites");
        const users = { ...adminPage([ADMINS]), title: "Users" };
        const sites = { ...adminPage([ADMINS]), title: "Sites" };
        pending.get("/admin/sites")!(ok({ current: sites } as PageParentDetailResponse));
        await Promise.resolve();
        pending.get("/admin/users")!(ok({ current: users } as PageParentDetailResponse));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect([state.page.title, notified]).toEqual(["Sites", 1]);
    });

    it("an API failure is the page's error", async () => {
        const failed: HttpResult<PageParentDetailResponse> = {
            ok: false,
            status: 500,
            body: undefined,
            problem: { title: "Request failed (envelope)", status: 500, detail: "Page.NotFound" },
            headers: new Headers(),
            response: new Response(),
        } as unknown as HttpResult<PageParentDetailResponse>;
        const state = new ViewState(client(async () => failed), new NavigationManager());
        await state.reload();
        expect([state.loaded, state.error]).toEqual([true, "Page.NotFound"]);
    });
});
