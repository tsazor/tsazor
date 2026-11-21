// The catalog's requests and responses (BlazorHero.Application's Features/Brands, Features/Products and
// Requests), as the API writes and reads them: camelCase JSON.

/** Enums/UploadType.cs: where the server stores an upload. */
export enum UploadType {
    Product = 0,
    ProfilePicture = 1,
    Document = 2,
}

/**
 * Requests/UploadRequest.cs. `data` is the file's bytes in base64, as System.Text.Json writes a byte[]. A request
 * without data (`new UploadRequest()` in C#) stores nothing: on a product it removes the picture.
 */
export interface UploadRequest {
    readonly fileName: string | null;
    readonly extension: string | null;
    readonly uploadType: UploadType;
    readonly data: string | null;
}

/** `new UploadRequest()`: no file. */
export const emptyUploadRequest: UploadRequest = { fileName: null, extension: null, uploadType: UploadType.Product, data: null };

/** Features/Brands/Queries/GetAll/GetAllBrandsResponse.cs. */
export interface GetAllBrandsResponse {
    readonly id: number;
    readonly name: string;
    readonly description: string;
    readonly tax: number;
}

/** Features/Brands/Commands/AddEdit/AddEditBrandCommand.cs: the dialog's model (id 0 adds a brand). */
export class AddEditBrandCommand {
    id = 0;
    name = "";
    description = "";
    tax = 0;
}

/** Features/Brands/Commands/Import/ImportBrandsCommand.cs. */
export interface ImportBrandsCommand {
    readonly uploadRequest: UploadRequest;
}

/** Features/Products/Queries/GetAllPaged/GetAllPagedProductsResponse.cs. */
export interface GetAllPagedProductsResponse {
    readonly id: number;
    readonly name: string;
    readonly barcode: string;
    readonly description: string;
    readonly rate: number;
    readonly brand: string;
    readonly brandId: number;
}

/** Requests/Catalog/GetAllPagedProductsRequest.cs (with PagedRequest): pages count from 1. */
export interface GetAllPagedProductsRequest {
    readonly pageNumber: number;
    readonly pageSize: number;
    readonly searchString: string;
    /** "Name", "Name descending", … — the server orders by them in turn. */
    readonly orderBy: readonly string[];
}

/** Features/Products/Commands/AddEdit/AddEditProductCommand.cs: the dialog's model (id 0 adds a product). */
export class AddEditProductCommand {
    id = 0;
    name = "";
    barcode = "";
    description = "";
    /** The picture as a data URL, for the dialog; the server ignores it. */
    imageDataURL: string | null = null;
    rate = 0;
    /** The picked brand; null until one is (MudAutocomplete's int was 0 — the manager still sends 0). */
    brandId: number | null = null;
    /** A new picture (or an empty request, which removes it). */
    uploadRequest: UploadRequest | null = null;
}
