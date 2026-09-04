using SalesDataPlugin;
using Xunit;

namespace Rmit.Fm.Dataverse.Plugins.UnitTests.Sales;

public class CreateSalesGoldPluginTests
{
    [Fact]
    public void ExecuteFromCustomApi_MapsInputAndOutputParameters()
    {
        var silverId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var data = new FakeAccess
        {
            Silver = new SalesSilverRecord(
                silverId,
                Guid.Parse("22222222-2222-2222-2222-222222222222"),
                "SO001",
                new DateOnly(2026, 8, 1),
                "C001",
                "ABC Ltd",
                "P001",
                "Laptop",
                2m,
                1000m,
                0.05m,
                "USD",
                "Valid"),
            CostPerUnit = 700m
        };

        var plugin = new CreateSalesGoldPlugin(data);
        var output = new Dictionary<string, object?>();

        var result = plugin.ExecuteFromCustomApi(
            new Dictionary<string, object?>
            {
                [CreateSalesGoldPlugin.InputSilverRecordId] = silverId.ToString(),
                [CreateSalesGoldPlugin.InputRunId] = "RUN-1",
                [CreateSalesGoldPlugin.InputReprocess] = false
            },
            output);

        Assert.True(result.Success);
        Assert.Equal(result.SalesGoldId, output[CreateSalesGoldPlugin.OutputSalesGoldId]);
        Assert.Equal(false, output[CreateSalesGoldPlugin.OutputIsUpdate]);
        Assert.Equal(string.Empty, output[CreateSalesGoldPlugin.OutputErrorMessage]);
    }

    private sealed class FakeAccess : ISalesGoldDataAccess
    {
        public SalesSilverRecord? Silver { get; set; }
        public decimal? CostPerUnit { get; set; }

        public SalesSilverRecord? GetSilver(Guid silverRecordId) =>
            Silver is not null && Silver.SalesSilverId == silverRecordId ? Silver : null;

        public decimal? GetProductCostPerUnit(string productCode) => CostPerUnit;

        public string GetSourceSystem() => "GOOGLE_DRIVE";

        public (decimal High, decimal Medium) GetSalesCategoryThresholds() => (2000m, 1000m);

        public Guid? FindGoldId(string sourceSystem, string orderId) => null;

        public Guid UpsertGold(SalesGoldRecord record, Guid? existingId) =>
            Guid.Parse("44444444-4444-4444-4444-444444444444");
    }
}
