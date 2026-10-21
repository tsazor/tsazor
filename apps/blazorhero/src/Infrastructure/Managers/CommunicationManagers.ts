import { TsazorHttp } from "@tsazor/runtime";
import type { ChatHistory, ChatHistoryResponse, ChatUserResponse } from "../../Application/Chat";
import type { DashboardDataResponse } from "../../Application/Dashboard";
import type { Result, ResultOf } from "../../Application/Wrapper";
import { ChatEndpoint, DashboardEndpoints } from "../Routes";

// Client.Infrastructure/Managers/Dashboard and /Communication: the dashboard's numbers and the chat's calls.

/** Managers/Dashboard/DashboardManager.cs. */
export class DashboardManager {
    constructor(private readonly http: TsazorHttp) {}

    async getDataAsync(): Promise<ResultOf<DashboardDataResponse>> {
        return (await this.http.getJson<ResultOf<DashboardDataResponse>>(DashboardEndpoints.GetData))!;
    }
}

/** Managers/Communication/ChatManager.cs. */
export class ChatManager {
    constructor(private readonly http: TsazorHttp) {}

    /** Every user but the signed-in one, the ones last written to first. */
    async getChatUsersAsync(): Promise<ResultOf<ChatUserResponse[]>> {
        return (await this.http.getJson<ResultOf<ChatUserResponse[]>>(ChatEndpoint.GetAvailableUsers))!;
    }

    /** The server takes the sender from the token and the time from its clock. */
    async saveMessageAsync(chatHistory: ChatHistory): Promise<Result> {
        return (await this.http.postJson<Result>(ChatEndpoint.SaveMessage, chatHistory))!;
    }

    /** The conversation with `contactId`, oldest first. */
    async getChatHistoryAsync(contactId: string): Promise<ResultOf<ChatHistoryResponse[]>> {
        return (await this.http.getJson<ResultOf<ChatHistoryResponse[]>>(ChatEndpoint.getChatHistory(contactId)))!;
    }
}
