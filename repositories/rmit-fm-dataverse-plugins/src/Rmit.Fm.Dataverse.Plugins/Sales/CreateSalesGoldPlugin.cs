namespace SalesDataPlugin;

/// <summary>
/// Dataverse Custom API entrypoint shim for sdp_CalculateSalesGold.
/// Maps InputParameters → CreateSalesGoldRequest and OutputParameters ← CreateSalesGoldResult.
/// Replace LocalPluginContext with the Pac-generated PluginBase context after
/// <c>pac plugin init</c> (repo scaffold gate). Until then this class documents the
/// contract and can be invoked from unit / integration harnesses.
/// </summary>
public sealed class CreateSalesGoldPlugin
{
    public const string MessageName = "sdp_CalculateSalesGold";
    public const string InputSilverRecordId = "SilverRecordId";
    public const string InputRunId = "RunId";
    public const string InputReprocess = "Reprocess";
    public const string OutputSalesGoldId = "SalesGoldId";
    public const string OutputIsUpdate = "IsUpdate";
    public const string OutputErrorMessage = "ErrorMessage";

    private readonly CreateSalesGold _handler;

    public CreateSalesGoldPlugin(ISalesGoldDataAccess dataAccess)
        : this(new CreateSalesGold(dataAccess))
    {
    }

    public CreateSalesGoldPlugin(CreateSalesGold handler)
    {
        _handler = handler ?? throw new ArgumentNullException(nameof(handler));
    }

    public CreateSalesGoldResult ExecuteFromCustomApi(
        IReadOnlyDictionary<string, object?> inputParameters,
        IDictionary<string, object?> outputParameters)
    {
        if (inputParameters is null)
        {
            throw new ArgumentNullException(nameof(inputParameters));
        }

        if (outputParameters is null)
        {
            throw new ArgumentNullException(nameof(outputParameters));
        }

        if (!inputParameters.TryGetValue(InputSilverRecordId, out var silverRaw) || silverRaw is null)
        {
            var missing = FailAndWrite(outputParameters, "SilverRecordId is required.");
            return missing;
        }

        var runId = inputParameters.TryGetValue(InputRunId, out var runRaw)
            ? runRaw?.ToString()
            : null;

        var reprocess = false;
        if (inputParameters.TryGetValue(InputReprocess, out var reprocessRaw) && reprocessRaw is bool flag)
        {
            reprocess = flag;
        }

        var result = _handler.Execute(new CreateSalesGoldRequest(
            SilverRecordId: silverRaw.ToString()!,
            RunId: runId,
            Reprocess: reprocess));

        outputParameters[OutputSalesGoldId] = result.SalesGoldId ?? string.Empty;
        outputParameters[OutputIsUpdate] = result.IsUpdate;
        outputParameters[OutputErrorMessage] = result.ErrorMessage ?? string.Empty;

        return result;
    }

    private static CreateSalesGoldResult FailAndWrite(
        IDictionary<string, object?> outputParameters,
        string message)
    {
        var result = new CreateSalesGoldResult(false, null, false, message);
        outputParameters[OutputSalesGoldId] = string.Empty;
        outputParameters[OutputIsUpdate] = false;
        outputParameters[OutputErrorMessage] = message;
        return result;
    }
}
