import { describe, expect, it } from "vitest";
import { backUrl, pluginViewUrl } from "../src/Plugins/Base/plugin-urls";

describe("a plugin's view URLs (FluentCMS's GetUrl / NavigateBack)", () => {
    const page = "http://localhost:5342/admin/roles";

    it("names the plugin and the view, and returns to the page", () => {
        const url = pluginViewUrl(page, "p1", "Update Role", { id: "r9" });
        const query = new URL(url, page).searchParams;
        expect(new URL(url, page).pathname).toBe("/admin/roles");
        expect(query.get("pluginId")).toBe("p1");
        expect(query.get("viewName")).toBe("Update Role");
        expect(query.get("id")).toBe("r9");
        expect(query.get("redirectTo")).toBe("/admin/roles");
        expect(backUrl(new URL(url, page).href)).toBe("/admin/roles");
    });

    it("keeps the current query, and the way back keeps it too (but not an older redirectTo)", () => {
        const current = `${page}?folderId=f1&redirectTo=%2Fadmin`;
        const query = new URL(pluginViewUrl(current, "p1", "Rename"), page).searchParams;
        expect(query.get("folderId")).toBe("f1");
        expect(query.get("redirectTo")).toBe("/admin/roles?folderId=f1");
    });

    it("without redirectToCurrentPage, a view keeps the redirectTo it was given", () => {
        const current = `${page}?redirectTo=%2Fadmin`;
        const query = new URL(pluginViewUrl(current, "p1", "Create Role", {}, false), page).searchParams;
        expect(query.get("redirectTo")).toBe("/admin");
    });

    it("without a redirectTo, back is the page itself", () => {
        expect(backUrl(`${page}?pluginId=p1&viewName=Create%20Role`)).toBe("/admin/roles");
    });
});
