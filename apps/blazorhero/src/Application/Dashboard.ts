// BlazorHero.Application's Features/Dashboards: the dashboard's numbers, as the API writes them (camelCase JSON).

/** Features/Dashboards/Queries/GetData/DashboardDataResponse.cs. */
export interface DashboardDataResponse {
    readonly productCount: number;
    readonly brandCount: number;
    readonly documentCount: number;
    readonly documentTypeCount: number;
    readonly documentExtendedAttributeCount: number;
    readonly userCount: number;
    readonly roleCount: number;
    /** A series per entity, a value per month of the current year: what was added. */
    readonly dataEnterBarChart: ChartSeries[];
    readonly productByBrandTypePieChart: Readonly<Record<string, number>> | null;
}

/** DashboardDataResponse.cs' ChartSeries. */
export interface ChartSeries {
    readonly name: string;
    readonly data: number[];
}
