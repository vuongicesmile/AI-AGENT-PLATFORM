using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace SalesDemo.Functions;

public sealed class ParseSalesCsv(SalesCsvParser parser, ILogger<ParseSalesCsv> log)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    [Function("ParseSalesCsv")]
    public async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Function, "post", Route = "parse-sales-csv")] HttpRequest request,
        FunctionContext context)
    {
        var id = context.InvocationId;
        try {
            // [1] Đọc có giới hạn kể cả client không gửi Content-Length.
            if (request.ContentLength > SalesCsvParser.MaxRequestBytes) throw TooLarge();
            using var buffer = new MemoryStream();
            var chunk = new byte[8192];
            int read;
            while ((read = await request.Body.ReadAsync(chunk, context.CancellationToken)) > 0) {
                if (buffer.Length + read > SalesCsvParser.MaxRequestBytes) throw TooLarge();
                await buffer.WriteAsync(chunk.AsMemory(0, read), context.CancellationToken);
            }
            buffer.Position = 0;
            var input = await JsonSerializer.DeserializeAsync<ParseSalesRequest>(buffer, Json, context.CancellationToken)
                ?? throw new JsonException();
            var result = parser.Parse(input, id);
            log.LogInformation("Parsed CSV; Batch={Batch}; Run={Run}; Rows={Rows}; CorrelationId={Id}",
                input.BatchKey, input.RunId, result.RowCount, id);
            return Reply(result, 200);
        } catch (CsvInputException ex) {
            log.LogWarning("CSV rejected; Code={Code}; CorrelationId={Id}", ex.Code, id);
            return Reply(new ApiError(ex.Code, ex.Message, id), ex.Status);
        } catch (JsonException) {
            return Reply(new ApiError("JSON_INVALID", "Body JSON không hợp lệ.", id), 400);
        } catch (Exception ex) {
            log.LogError(ex, "ParseSalesCsv failed; CorrelationId={Id}", id);
            return Reply(new ApiError("SERVER_ERROR", "Không xử lý được CSV; tra log theo CorrelationId.", id), 500);
        }
    }
    private static CsvInputException TooLarge() => new("REQUEST_TOO_LARGE", "Request vượt giới hạn bài học.", 413);
    private static ContentResult Reply(object body, int status) => new() {
        StatusCode = status, ContentType = "application/json; charset=utf-8", Content = JsonSerializer.Serialize(body, Json)
    };
}
