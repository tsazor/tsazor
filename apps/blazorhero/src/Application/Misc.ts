// BlazorHero.Application's Features/Documents, DocumentTypes and ExtendedAttributes, and Responses/Audit, as the API
// writes them: camelCase JSON, dates as ISO strings.
import { Decimal } from "@tsazor/primitives";
import type { UploadRequest } from "./Catalog";

/** Features/DocumentTypes/Queries/GetAll/GetAllDocumentTypesResponse.cs. */
export interface GetAllDocumentTypesResponse {
    readonly id: number;
    readonly name: string;
    readonly description: string;
}

/** Features/DocumentTypes/Commands/AddEdit/AddEditDocumentTypeCommand.cs. */
export class AddEditDocumentTypeCommand {
    id = 0;
    name = "";
    description = "";
}

/** Features/Documents/Queries/GetAll/GetAllDocumentsResponse.cs. */
export interface GetAllDocumentsResponse {
    readonly id: number;
    readonly title: string;
    readonly description: string;
    readonly isPublic: boolean;
    readonly createdBy: string;
    readonly createdOn: string;
    readonly url: string | null;
    readonly documentType: string;
    readonly documentTypeId: number;
}

/** Features/Documents/Commands/AddEdit/AddEditDocumentCommand.cs: `URL` is `url` in camelCase JSON. */
export class AddEditDocumentCommand {
    id = 0;
    title = "";
    description = "";
    isPublic = false;
    url: string | null = null;
    documentTypeId = 0;
    uploadRequest: UploadRequest | null = null;
}

/** Domain/Enums/EntityExtendedAttributeType.cs (serialized as its number). */
export enum EntityExtendedAttributeType {
    Decimal = 1,
    Text = 2,
    DateTime = 3,
    Json = 4,
}

/** Features/ExtendedAttributes/Queries/GetAllByEntityId/GetAllExtendedAttributesByEntityIdResponse.cs. */
export interface GetAllExtendedAttributesByEntityIdResponse<TId, TEntityId> {
    readonly id: TId;
    readonly entityId: TEntityId;
    readonly type: EntityExtendedAttributeType;
    readonly key: string;
    readonly text: string | null;
    /** `decimal?` on the wire: a number. */
    readonly decimal: number | null;
    readonly dateTime: string | null;
    readonly json: string | null;
    readonly externalId: string | null;
    readonly group: string | null;
    readonly description: string | null;
    readonly isActive: boolean;
    readonly createdBy: string;
    readonly createdOn: string;
    readonly lastModifiedBy: string | null;
    readonly lastModifiedOn: string | null;
}

/**
 * Features/ExtendedAttributes/Commands/AddEdit/AddEditExtendedAttributeCommand.cs. `decimal` is a `Decimal`
 * (@tsazor/primitives), exact as .NET's; it goes out as its text, which ASP.NET's JSON reads into a decimal.
 */
export class AddEditExtendedAttributeCommand<TId, TEntityId> {
    constructor(
        public id: TId,
        public entityId: TEntityId,
    ) {}

    type = EntityExtendedAttributeType.Text;
    key = "";
    text: string | null = null;
    decimal: Decimal | null = null;
    dateTime: Date | null = null;
    json: string | null = null;
    externalId: string | null = null;
    group: string | null = null;
    description: string | null = null;
    isActive = true;

    /** The command for an existing attribute (InvokeModal's mapping). */
    static of<TId, TEntityId>(attribute: GetAllExtendedAttributesByEntityIdResponse<TId, TEntityId>): AddEditExtendedAttributeCommand<TId, TEntityId> {
        const command = new AddEditExtendedAttributeCommand(attribute.id, attribute.entityId);
        command.type = attribute.type;
        command.key = attribute.key;
        command.text = attribute.text;
        command.decimal = attribute.decimal === null ? null : Decimal.from(attribute.decimal);
        command.dateTime = attribute.dateTime === null ? null : new Date(attribute.dateTime);
        command.json = attribute.json;
        command.externalId = attribute.externalId;
        command.group = attribute.group;
        command.description = attribute.description;
        command.isActive = attribute.isActive;
        return command;
    }
}

/** Features/ExtendedAttributes/Queries/Export/ExportExtendedAttributesQuery.cs. */
export interface ExportExtendedAttributesQuery<TEntityId> {
    readonly searchString: string;
    readonly entityId: TEntityId;
    readonly includeEntity: boolean;
    readonly onlyCurrentGroup: boolean;
    readonly currentGroup: string;
}

/** Responses/Audit/AuditResponse.cs. */
export interface AuditResponse {
    readonly id: number;
    readonly userId: string;
    readonly type: string;
    readonly tableName: string;
    readonly dateTime: string;
    readonly oldValues: string | null;
    readonly newValues: string | null;
    readonly affectedColumns: string | null;
    readonly primaryKey: string;
}
