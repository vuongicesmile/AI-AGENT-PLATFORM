namespace SalesDataPlugin;

/// <summary>
/// Custom API handler for sdp_CalculateSalesGold (plan.md §8).
/// Plugin type name: SalesDataPlugin.CreateSalesGold.
/// Wire to Dataverse via PluginBase / IPlugin after <c>pac plugin init</c>.
/// </summary>
public sealed class CreateSalesGold
{
    private readonly ISalesGoldDataAccess _data;

    public CreateSalesGold(ISalesGoldDataAccess data)
    {
        _data = data ?? throw new ArgumentNullException(nameof(data));
    }

    public CreateSalesGoldResult Execute(CreateSalesGoldRequest request)
    {
        if (request is null)
        {
            throw new ArgumentNullException(nameof(request));
        }

        if (!Guid.TryParse(request.SilverRecordId, out var silverId))
        {
            return Fail("SilverRecordId must be a valid GUID.");
        }

        var silver = _data.GetSilver(silverId);
        if (silver is null)
        {
            return Fail($"SilverRecordId {request.SilverRecordId} not found.");
        }

        if (!string.Equals(silver.DataQualityStatus, "Valid", StringComparison.OrdinalIgnoreCase))
        {
            return Fail($"Silver record {silver.SalesSilverId} is not Valid.");
        }

        if (string.IsNullOrWhiteSpace(silver.ProductCode))
        {
            return Fail("ProductCode is required to resolve cost.");
        }

        var costPerUnit = _data.GetProductCostPerUnit(silver.ProductCode);
        if (costPerUnit is null)
        {
            return Fail($"Product {silver.ProductCode} could not be resolved for cost.");
        }

        var metrics = SalesGoldCalculator.Calculate(
            silver.Quantity,
            silver.UnitPrice,
            silver.DiscountPct,
            costPerUnit.Value);

        var (high, medium) = _data.GetSalesCategoryThresholds();
        var sourceSystem = _data.GetSourceSystem();
        var existingGoldId = _data.FindGoldId(sourceSystem, silver.OrderId);
        var isUpdate = existingGoldId.HasValue;

        var gold = new SalesGoldRecord(
            DataSourceId: silver.DataSourceId,
            SourceSystem: sourceSystem,
            OrderId: silver.OrderId,
            OrderDate: silver.OrderDate,
            Year: silver.OrderDate.Year,
            Month: silver.OrderDate.Month,
            CustomerCode: silver.CustomerCode,
            CustomerName: silver.CustomerName,
            ProductCode: silver.ProductCode,
            ProductName: silver.ProductName,
            Currency: silver.Currency,
            GrossSales: metrics.GrossSales,
            DiscountAmount: metrics.DiscountAmount,
            NetSales: metrics.NetSales,
            Cost: metrics.Cost,
            GrossProfit: metrics.GrossProfit,
            GrossMarginPct: metrics.GrossMarginPct,
            SalesCategory: SalesCategoryRules.Determine(metrics.NetSales, high, medium),
            ReportStatus: "Ready",
            ProcessedOn: DateTime.UtcNow);

        var goldId = _data.UpsertGold(gold, existingGoldId);

        return new CreateSalesGoldResult(
            Success: true,
            SalesGoldId: goldId.ToString(),
            IsUpdate: isUpdate,
            ErrorMessage: null);
    }

    private static CreateSalesGoldResult Fail(string message) =>
        new(Success: false, SalesGoldId: null, IsUpdate: false, ErrorMessage: message);
}
