using SalesDataPlugin;
using Xunit;

namespace Rmit.Fm.Dataverse.Plugins.UnitTests.Sales;

public class SalesGoldCalculatorTests
{
    [Fact]
    public void Calculate_PlanExample_ReturnsExpectedMetrics()
    {
        var metrics = SalesGoldCalculator.Calculate(
            quantity: 2m,
            unitPrice: 1000m,
            discountPct: 0.05m,
            costPerUnit: 700m);

        Assert.Equal(2000m, metrics.GrossSales);
        Assert.Equal(100m, metrics.DiscountAmount);
        Assert.Equal(1900m, metrics.NetSales);
        Assert.Equal(1400m, metrics.Cost);
        Assert.Equal(500m, metrics.GrossProfit);
        Assert.Equal(0.263158m, metrics.GrossMarginPct);
    }

    [Fact]
    public void Calculate_ZeroNetSales_ReturnsZeroMarginWithoutThrowing()
    {
        var metrics = SalesGoldCalculator.Calculate(
            quantity: 0m,
            unitPrice: 1000m,
            discountPct: 0m,
            costPerUnit: 700m);

        Assert.Equal(0m, metrics.NetSales);
        Assert.Equal(0m, metrics.GrossMarginPct);
    }

    [Theory]
    [InlineData(2000, "High")]
    [InlineData(1900, "Medium")]
    [InlineData(1000, "Medium")]
    [InlineData(999.99, "Low")]
    public void DetermineSalesCategory_UsesPlanThresholds(decimal netSales, string expected)
    {
        var category = SalesCategoryRules.Determine(netSales, highThreshold: 2000m, mediumThreshold: 1000m);
        Assert.Equal(expected, category);
    }
}
