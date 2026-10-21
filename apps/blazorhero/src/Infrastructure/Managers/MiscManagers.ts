import { TsazorHttp } from "@tsazor/runtime";
import type {
    AddEditDocumentCommand,
    AddEditDocumentTypeCommand,
    AddEditExtendedAttributeCommand,
    AuditResponse,
    ExportExtendedAttributesQuery,
    GetAllDocumentTypesResponse,
    GetAllDocumentsResponse,
    GetAllExtendedAttributesByEntityIdResponse,
} from "../../Application/Misc";
import type { PaginatedResult, ResultOf } from "../../Application/Wrapper";
import { AuditEndpoints, DocumentTypesEndpoints, DocumentsEndpoints, ExtendedAttributesEndpoints } from "../Routes";

// Client.Infrastructure/Managers/Misc and Managers/Audit: documents, their types, extended attributes, audit trails.

/** Managers/Misc/DocumentTypeManager.cs. */
export class DocumentTypeManager {
    constructor(private readonly http: TsazorHttp) {}

    async getAllAsync(): Promise<ResultOf<GetAllDocumentTypesResponse[]>> {
        return (await this.http.getJson<ResultOf<GetAllDocumentTypesResponse[]>>(DocumentTypesEndpoints.GetAll))!;
    }

    async saveAsync(request: AddEditDocumentTypeCommand): Promise<ResultOf<number>> {
        return (await this.http.postJson<ResultOf<number>>(DocumentTypesEndpoints.Save, request))!;
    }

    async deleteAsync(id: number): Promise<ResultOf<number>> {
        return (await this.http.deleteJson<ResultOf<number>>(DocumentTypesEndpoints.delete(id)))!;
    }

    /** The workbook (the types matching `searchString`) in base64. */
    async exportToExcelAsync(searchString = ""): Promise<ResultOf<string>> {
        return (await this.http.getJson<ResultOf<string>>(DocumentTypesEndpoints.export(searchString)))!;
    }
}

/** Managers/Misc/DocumentManager.cs. */
export class DocumentManager {
    constructor(private readonly http: TsazorHttp) {}

    async getAllAsync(pageNumber: number, pageSize: number, searchString: string): Promise<PaginatedResult<GetAllDocumentsResponse>> {
        return (await this.http.getJson<PaginatedResult<GetAllDocumentsResponse>>(DocumentsEndpoints.getAllPaged(pageNumber, pageSize, searchString)))!;
    }

    async saveAsync(request: AddEditDocumentCommand): Promise<ResultOf<number>> {
        return (await this.http.postJson<ResultOf<number>>(DocumentsEndpoints.Save, request))!;
    }

    async deleteAsync(id: number): Promise<ResultOf<number>> {
        return (await this.http.deleteJson<ResultOf<number>>(DocumentsEndpoints.delete(id)))!;
    }
}

/**
 * Managers/ExtendedAttribute/ExtendedAttributeManager.cs, generic over the attribute's and the entity's ids. The
 * original registers it once per entity as an open generic and builds its routes from `typeof(TEntity).Name`;
 * TypeScript's type arguments don't exist at run time, so the entity's name is a value — a subclass per entity,
 * registered under its own class (B39).
 */
export abstract class ExtendedAttributeManager<TId, TEntityId> {
    constructor(
        private readonly http: TsazorHttp,
        /** `typeof(TEntity).Name`: the controller's prefix, `Document` for `DocumentExtendedAttributes`. */
        readonly entityName: string,
    ) {}

    async getAllByEntityIdAsync(entityId: TEntityId): Promise<ResultOf<GetAllExtendedAttributesByEntityIdResponse<TId, TEntityId>[]>> {
        return (await this.http.getJson<ResultOf<GetAllExtendedAttributesByEntityIdResponse<TId, TEntityId>[]>>(ExtendedAttributesEndpoints.getAllByEntityId(this.entityName, entityId)))!;
    }

    async saveAsync(request: AddEditExtendedAttributeCommand<TId, TEntityId>): Promise<ResultOf<TId>> {
        return (await this.http.postJson<ResultOf<TId>>(ExtendedAttributesEndpoints.save(this.entityName), request))!;
    }

    async deleteAsync(id: TId): Promise<ResultOf<TId>> {
        return (await this.http.deleteJson<ResultOf<TId>>(ExtendedAttributesEndpoints.delete(this.entityName, id)))!;
    }

    /** The workbook in base64. */
    async exportToExcelAsync(request: ExportExtendedAttributesQuery<TEntityId>): Promise<ResultOf<string>> {
        return (await this.http.getJson<ResultOf<string>>(ExtendedAttributesEndpoints.export(this.entityName, request)))!;
    }
}

/** The documents' (`IExtendedAttributeManager<int, int, Document, DocumentExtendedAttribute>`). */
export class DocumentExtendedAttributeManager extends ExtendedAttributeManager<number, number> {
    constructor(http: TsazorHttp) {
        super(http, "Document");
    }
}

/** Managers/Audit/AuditManager.cs. */
export class AuditManager {
    constructor(private readonly http: TsazorHttp) {}

    async getCurrentUserTrailsAsync(): Promise<ResultOf<AuditResponse[]>> {
        return (await this.http.getJson<ResultOf<AuditResponse[]>>(AuditEndpoints.GetCurrentUserTrails))!;
    }

    /** The workbook in base64. */
    async downloadFileAsync(searchString = "", searchInOldValues = false, searchInNewValues = false): Promise<ResultOf<string>> {
        return (await this.http.getJson<ResultOf<string>>(AuditEndpoints.downloadFile(searchString, searchInOldValues, searchInNewValues)))!;
    }
}
