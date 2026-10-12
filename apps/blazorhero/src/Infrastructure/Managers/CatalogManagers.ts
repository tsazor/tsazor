import { TsazorHttp } from "@tsazor/runtime";
import type {
    AddEditBrandCommand,
    AddEditProductCommand,
    GetAllBrandsResponse,
    GetAllPagedProductsRequest,
    GetAllPagedProductsResponse,
    ImportBrandsCommand,
} from "../../Application/Catalog";
import type { PaginatedResult, ResultOf } from "../../Application/Wrapper";
import { BrandsEndpoints, ProductsEndpoints } from "../Routes";

// Client.Infrastructure/Managers/Catalog: the catalog's calls. A failure is an answer too (`succeeded: false`).

/** Managers/Catalog/Brand/BrandManager.cs. */
export class BrandManager {
    constructor(private readonly http: TsazorHttp) {}

    async getAllAsync(): Promise<ResultOf<GetAllBrandsResponse[]>> {
        return this.http.getJson<ResultOf<GetAllBrandsResponse[]>>(BrandsEndpoints.GetAll);
    }

    /** The new or updated brand's id. */
    async saveAsync(request: AddEditBrandCommand): Promise<ResultOf<number>> {
        return this.http.postJson<ResultOf<number>>(BrandsEndpoints.Save, request);
    }

    async deleteAsync(id: number): Promise<ResultOf<number>> {
        return this.http.deleteJson<ResultOf<number>>(BrandsEndpoints.delete(id));
    }

    /** The workbook (the brands matching `searchString`) in base64. */
    async exportToExcelAsync(searchString = ""): Promise<ResultOf<string>> {
        return this.http.getJson<ResultOf<string>>(BrandsEndpoints.export(searchString));
    }

    /** The number of brands imported. */
    async importAsync(request: ImportBrandsCommand): Promise<ResultOf<number>> {
        return this.http.postJson<ResultOf<number>>(BrandsEndpoints.Import, request);
    }
}

/** Managers/Catalog/Product/ProductManager.cs. */
export class ProductManager {
    constructor(private readonly http: TsazorHttp) {}

    async getProductsAsync(request: GetAllPagedProductsRequest): Promise<PaginatedResult<GetAllPagedProductsResponse>> {
        const url = ProductsEndpoints.getAllPaged(request.pageNumber, request.pageSize, request.searchString, request.orderBy);
        return this.http.getJson<PaginatedResult<GetAllPagedProductsResponse>>(url);
    }

    /** The stored picture's path ("Files\Images\Products\P-….png"), or null. */
    async getProductImageAsync(id: number): Promise<ResultOf<string | null>> {
        return this.http.getJson<ResultOf<string | null>>(ProductsEndpoints.getProductImage(id));
    }

    /** The new or updated product's id. No brand goes as 0, the int the API reads. */
    async saveAsync(request: AddEditProductCommand): Promise<ResultOf<number>> {
        return this.http.postJson<ResultOf<number>>(ProductsEndpoints.Save, { ...request, brandId: request.brandId ?? 0 });
    }

    async deleteAsync(id: number): Promise<ResultOf<number>> {
        return this.http.deleteJson<ResultOf<number>>(ProductsEndpoints.delete(id));
    }

    async exportToExcelAsync(searchString = ""): Promise<ResultOf<string>> {
        return this.http.getJson<ResultOf<string>>(ProductsEndpoints.export(searchString));
    }
}
