using SalesDataPlugin;
using Xunit;

namespace Rmit.Fm.Dataverse.Plugins.UnitTests.Sales;

public class CreateSalesGoldTests
{
    private static readonly Guid SilverId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid DataSourceId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid ExistingGoldId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private static SalesSilverRecord ValidSilver() => new(
        SalesSilverId: SilverId,
        DataSourceId: DataSourceId,
        OrderId: "SO001",
        OrderDate: new DateOnly(2026, 8, 1),
        CustomerCode: "C001",
        CustomerName: "ABC Ltd",
        ProductCode: "P001",
        ProductName: "Laptop",
        Quantity: 2m,
        UnitPrice: 1000m,
        DiscountPct: 0.05m,
        Currency: "USD",
        DataQualityStatus: "Valid");

    [Fact]
    public void Execute_ValidSilver_CreatesGoldWithPlanMetrics()
    {
        var data = new FakeSalesGoldDataAccess
        {
            Silver = ValidSilver(),
            CostPerUnit = 700m,
            SourceSystem = "GOOGLE_DRIVE",
            HighThreshold = 2000m,
            MediumThreshold = 1000m
        };
        var plugin = new CreateSalesGold(data);

        var result = plugin.Execute(new CreateSalesGoldRequest(SilverId.ToString(), RunId: null, Reprocess: false));

        Assert.True(result.Success);
        Assert.False(result.IsUpdate);
        Assert.NotNull(result.SalesGoldId);
        Assert.Null(result.ErrorMessage);
        Assert.Equal(2000m, data.LastUpserted!.GrossSales);
        Assert.Equal(100m, data.LastUpserted.DiscountAmount);
        Assert.Equal(1900m, data.LastUpserted.NetSales);
        Assert.Equal(1400m, data.LastUpserted.Cost);
        Assert.Equal(500m, data.LastUpserted.GrossProfit);
        Assert.Equal(0.263158m, data.LastUpserted.GrossMarginPct);
        Assert.Equal("Medium", data.LastUpserted.SalesCategory);
        Assert.Equal(2026, data.LastUpserted.Year);
        Assert.Equal(8, data.LastUpserted.Month);
        Assert.Equal("GOOGLE_DRIVE", data.LastUpserted.SourceSystem);
    }

    [Fact]
    public void Execute_ExistingBusinessKey_UpdatesWithoutDuplicate()
    {
        var data = new FakeSalesGoldDataAccess
        {
            Silver = ValidSilver(),
            CostPerUnit = 700m,
            SourceSystem = "GOOGLE_DRIVE",
            ExistingGoldId = ExistingGoldId
        };
        var plugin = new CreateSalesGold(data);

        var result = plugin.Execute(new CreateSalesGoldRequest(SilverId.ToString(), null, false));

        Assert.True(result.Success);
        Assert.True(result.IsUpdate);
        Assert.Equal(ExistingGoldId.ToString(), result.SalesGoldId);
        Assert.Equal(1, data.UpsertCount);
    }

    [Fact]
    public void Execute_MissingSilver_ReturnsError()
    {
        var data = new FakeSalesGoldDataAccess { Silver = null };
        var plugin = new CreateSalesGold(data);

        var result = plugin.Execute(new CreateSalesGoldRequest(SilverId.ToString(), null, false));

        Assert.False(result.Success);
        Assert.Contains("not found", result.ErrorMessage!, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(0, data.UpsertCount);
    }

    [Fact]
    public void Execute_NonValidSilver_ReturnsError()
    {
        var silver = ValidSilver() with { DataQualityStatus = "Error" };
        var data = new FakeSalesGoldDataAccess { Silver = silver, CostPerUnit = 700m };
        var plugin = new CreateSalesGold(data);

        var result = plugin.Execute(new CreateSalesGoldRequest(SilverId.ToString(), null, false));

        Assert.False(result.Success);
        Assert.Contains("not Valid", result.ErrorMessage!, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(0, data.UpsertCount);
    }

    [Fact]
    public void Execute_UnresolvedProductCost_ReturnsError()
    {
        var data = new FakeSalesGoldDataAccess
        {
            Silver = ValidSilver(),
            CostPerUnit = null
        };
        var plugin = new CreateSalesGold(data);

        var result = plugin.Execute(new CreateSalesGoldRequest(SilverId.ToString(), null, false));

        Assert.False(result.Success);
        Assert.Contains("cost", result.ErrorMessage!, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(0, data.UpsertCount);
    }

    [Fact]
    public void Execute_ZeroNetSales_SetsMarginToZero()
    {
        var silver = ValidSilver() with { Quantity = 0m, UnitPrice = 1000m, DiscountPct = 0m };
        var data = new FakeSalesGoldDataAccess
        {
            Silver = silver,
            CostPerUnit = 700m,
            SourceSystem = "GOOGLE_DRIVE"
        };
        var plugin = new CreateSalesGold(data);

        var result = plugin.Execute(new CreateSalesGoldRequest(SilverId.ToString(), null, false));

        Assert.True(result.Success);
        Assert.Equal(0m, data.LastUpserted!.NetSales);
        Assert.Equal(0m, data.LastUpserted.GrossMarginPct);
        Assert.Equal("Low", data.LastUpserted.SalesCategory);
    }

    private sealed class FakeSalesGoldDataAccess : ISalesGoldDataAccess
    {
        public SalesSilverRecord? Silver { get; set; }
        public decimal? CostPerUnit { get; set; }
        public string SourceSystem { get; set; } = "GOOGLE_DRIVE";
        public decimal HighThreshold { get; set; } = 2000m;
        public decimal MediumThreshold { get; set; } = 1000m;
        public Guid? ExistingGoldId { get; set; }
        public SalesGoldRecord? LastUpserted { get; private set; }
        public int UpsertCount { get; private set; }

        public SalesSilverRecord? GetSilver(Guid silverRecordId) =>
            Silver is not null && Silver.SalesSilverId == silverRecordId ? Silver : null;

        public decimal? GetProductCostPerUnit(string productCode) => CostPerUnit;

        public string GetSourceSystem() => SourceSystem;

        public (decimal High, decimal Medium) GetSalesCategoryThresholds() => (HighThreshold, MediumThreshold);

        public Guid? FindGoldId(string sourceSystem, string orderId) => ExistingGoldId;

        public Guid UpsertGold(SalesGoldRecord record, Guid? existingId)
        {
            UpsertCount += 1;
            LastUpserted = record;
            return existingId ?? Guid.Parse("44444444-4444-4444-4444-444444444444");
        }
    }
}
