// BlazorHero.Application's chat models and responses (Models/Chat, Responses/Identity), as the API and the hub
// write them: camelCase JSON, dates as ISO strings.

/** Models/Chat/ChatHistory.cs: a message, as the client saves it and the hub passes it on. */
export interface ChatHistory {
    id?: number;
    fromUserId?: string;
    toUserId: string;
    message: string;
    createdDate: Date | string;
}

/** Responses/Identity/ChatHistoryResponse.cs: a message of a conversation's history. */
export interface ChatHistoryResponse {
    readonly id?: number;
    readonly fromUserId?: string;
    readonly fromUserImageURL: string | null;
    readonly fromUserFullName: string;
    readonly toUserId?: string;
    readonly toUserImageURL?: string | null;
    readonly toUserFullName?: string;
    readonly message: string;
    readonly createdDate: string;
}

/** Responses/Identity/ChatUserResponse.cs: a contact; `isOnline` is the page's own, set by the hub's messages. */
export interface ChatUserResponse {
    readonly id: string;
    readonly userName: string;
    readonly profilePictureDataUrl: string | null;
    readonly firstName: string;
    readonly lastName: string;
    readonly emailAddress: string;
    isOnline: boolean;
}
