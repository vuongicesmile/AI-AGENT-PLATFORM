namespace SalesDataPlugin;

/// <summary>
/// MVP SalesCategory rule from plan.md §10.
/// Thresholds should come from configuration / environment variables in production.
/// </summary>
public static class SalesCategoryRules
{
    public static string Determine(decimal netSales, decimal highThreshold, decimal mediumThreshold)
    {
        if (netSales >= highThreshold)
        {
            return "High";
        }

        if (netSales >= mediumThreshold)
        {
            return "Medium";
        }

        return "Low";
    }
}
