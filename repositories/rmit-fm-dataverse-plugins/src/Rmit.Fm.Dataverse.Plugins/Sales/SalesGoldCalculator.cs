namespace SalesDataPlugin;

/// <summary>
/// Gold metric formulas from plan.md §9.
/// </summary>
public static class SalesGoldCalculator
{
    public static SalesGoldMetrics Calculate(
        decimal quantity,
        decimal unitPrice,
        decimal discountPct,
        decimal costPerUnit)
    {
        var grossSales = Round(quantity * unitPrice, 4);
        var discountAmount = Round(grossSales * discountPct, 4);
        var netSales = Round(grossSales - discountAmount, 4);
        var cost = Round(quantity * costPerUnit, 4);
        var grossProfit = Round(netSales - cost, 4);
        var grossMarginPct = netSales == 0m ? 0m : Round(grossProfit / netSales, 6);

        return new SalesGoldMetrics(
            GrossSales: grossSales,
            DiscountAmount: discountAmount,
            NetSales: netSales,
            Cost: cost,
            GrossProfit: grossProfit,
            GrossMarginPct: grossMarginPct);
    }

    public static decimal Round(decimal value, int precision)
    {
        return Math.Round(value, precision, MidpointRounding.AwayFromZero);
    }
}

public sealed record SalesGoldMetrics(
    decimal GrossSales,
    decimal DiscountAmount,
    decimal NetSales,
    decimal Cost,
    decimal GrossProfit,
    decimal GrossMarginPct);
