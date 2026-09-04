namespace SalesDataPlugin;

public sealed record SalesSilverRecord(
    Guid SalesSilverId,
    Guid DataSourceId,
    string OrderId,
    DateOnly OrderDate,
    string? CustomerCode,
    string? CustomerName,
    string? ProductCode,
    string? ProductName,
    decimal Quantity,
    decimal UnitPrice,
    decimal DiscountPct,
    string? Currency,
    string DataQualityStatus);

public sealed record SalesGoldRecord(
    Guid DataSourceId,
    string SourceSystem,
    string OrderId,
    DateOnly OrderDate,
    int Year,
    int Month,
    string? CustomerCode,
    string? CustomerName,
    string? ProductCode,
    string? ProductName,
    string? Currency,
    decimal GrossSales,
    decimal DiscountAmount,
    decimal NetSales,
    decimal Cost,
    decimal GrossProfit,
    decimal GrossMarginPct,
    string SalesCategory,
    string ReportStatus,
    DateTime ProcessedOn);

public sealed record CreateSalesGoldRequest(
    string SilverRecordId,
    string? RunId,
    bool Reprocess);

public sealed record CreateSalesGoldResult(
    bool Success,
    string? SalesGoldId,
    bool IsUpdate,
    string? ErrorMessage);

/// <summary>
/// Data access boundary for Custom API CalculateSalesGold.
/// Production adapter uses IOrganizationService against Dataverse tables.
/// </summary>
public interface ISalesGoldDataAccess
{
    SalesSilverRecord? GetSilver(Guid silverRecordId);

    decimal? GetProductCostPerUnit(string productCode);

    string GetSourceSystem();

    (decimal High, decimal Medium) GetSalesCategoryThresholds();

    Guid? FindGoldId(string sourceSystem, string orderId);

    Guid UpsertGold(SalesGoldRecord record, Guid? existingId);
}
