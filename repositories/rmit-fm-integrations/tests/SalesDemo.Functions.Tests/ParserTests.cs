using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SalesDemo.Functions;
using Xunit;

public sealed class ParserTests
{
    private readonly SalesCsvParser parser = new();
    private const string Header = "Order ID,Date,Customer Code,Customer,Product Code,Product,Qty,Unit Price,Discount,Currency\r\n";
    private const string Row = "SO001,01/08/2026,C001,ABC Ltd,P001,Laptop,2,1000,5%,USD\r\n";
    private static ParseSalesRequest Request(string csv) => new("Sales_2026_08.csv", "demo01", "run01", Convert.ToBase64String(Encoding.UTF8.GetBytes(csv)));
    [Fact] public void Fixture_is_ten_raw_rows_with_source_hash() {
        var bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "sales.csv"));
        var result = parser.Parse(new("Sales_2026_08.csv", "demo01", "run01", Convert.ToBase64String(bytes)), "request1");
        Assert.Equal(10, result.RowCount);
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(bytes)), result.FileHash);
        Assert.Equal("2", result.Rows[0].Values["Qty"]);
        Assert.Equal(10, result.Rows[9].RowNumber);
    }
    [Fact] public void Quoted_comma_newline_and_escaped_quote_are_preserved() {
        var row = "SO001,01/08/2026,C001,\"ABC, \"\"Company\"\"\r\nLtd\",P001,Laptop,2,1000,5%,USD\r\n";
        var result = parser.Parse(Request(Header + row), "r");
        Assert.Single(result.Rows); Assert.Equal("ABC, \"Company\"\r\nLtd", result.Rows[0].Values["Customer"]);
    }
    [Fact] public void Invalid_quantity_still_reaches_raw() {
        var result = parser.Parse(Request(Header + Row.Replace(",2,", ",abc,")), "r");
        Assert.Equal("abc", result.Rows[0].Values["Qty"]);
    }
    [Fact] public void Bom_is_part_of_hash_but_not_header() {
        var noBom = parser.Parse(Request(Header + Row), "r");
        var bom = parser.Parse(Request("\uFEFF" + Header + Row), "r");
        Assert.NotEqual(noBom.FileHash, bom.FileHash); Assert.Equal(noBom.RowCount, bom.RowCount);
    }
    [Theory]
    [InlineData("bad.csv", "demo01", "run01", "FILE_NAME_INVALID")]
    [InlineData("Sales_2026_13.csv", "demo01", "run01", "FILE_NAME_INVALID")]
    [InlineData("Sales_2026_08.csv", "bad/key", "run01", "KEY_INVALID")]
    [InlineData("Sales_2026_08.csv", "demo01", "", "KEY_INVALID")]
    public void Contract_is_validated(string file, string batch, string run, string code) {
        var request = Request(Header + Row) with { FileName = file, BatchKey = batch, RunId = run };
        Assert.Equal(code, Assert.Throws<CsvInputException>(() => parser.Parse(request, "r")).Code);
    }
    [Theory]
    [InlineData("header", "HEADER_INVALID")]
    [InlineData("empty", "CSV_EMPTY")]
    [InlineData("columns", "COLUMN_COUNT_INVALID")]
    [InlineData("quotes", "CSV_INVALID")]
    [InlineData("eleven", "ROW_LIMIT")]
    public void Invalid_csv_has_a_specific_400(string scenario, string code) {
        string csv = scenario switch {
            "header" => Header.Replace("Qty", "Quantity") + Row,
            "empty" => Header,
            "columns" => Header + "SO001,2\r\n",
            "quotes" => Header + "\"unfinished",
            _ => Header + string.Concat(Enumerable.Repeat(Row, 11))
        };
        var error = Assert.Throws<CsvInputException>(() => parser.Parse(Request(csv), "r"));
        Assert.Equal(code, error.Code); Assert.Equal(400, error.Status);
    }
    [Fact] public void Invalid_utf8_is_rejected() {
        var request = Request(Header + Row) with { CsvBase64 = Convert.ToBase64String([0xff, 0xfe, 0xff]) };
        Assert.Equal("ENCODING_INVALID", Assert.Throws<CsvInputException>(() => parser.Parse(request, "r")).Code);
    }
    [Fact] public void Oversized_base64_is_413_before_parse() {
        var request = Request(Header + Row) with { CsvBase64 = new string('A', 140000) };
        Assert.Equal(413, Assert.Throws<CsvInputException>(() => parser.Parse(request, "r")).Status);
    }
    [Fact] public void Malformed_base64_is_400() {
        var request = Request(Header + Row) with { CsvBase64 = "%%%" };
        Assert.Equal("BASE64_INVALID", Assert.Throws<CsvInputException>(() => parser.Parse(request, "r")).Code);
    }
    [Fact] public void Response_serialization_matches_connector_contract() {
        var result = parser.Parse(Request(Header + Row), "r");
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(result, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        Assert.Equal(1, json.RootElement.GetProperty("rowCount").GetInt32());
        Assert.Equal("SO001", json.RootElement.GetProperty("rows")[0].GetProperty("values").GetProperty("Order ID").GetString());
    }
}
