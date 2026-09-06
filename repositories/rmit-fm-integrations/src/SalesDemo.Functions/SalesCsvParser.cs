using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.VisualBasic.FileIO;

namespace SalesDemo.Functions;

public sealed record ParseSalesRequest(string FileName, string BatchKey, string RunId, string CsvBase64);
public sealed record RawSalesRow(int RowNumber, Dictionary<string, string> Values);
public sealed record ParseSalesResult(string FileHash, int RowCount, string CorrelationId, IReadOnlyList<RawSalesRow> Rows);
public sealed record ApiError(string Code, string Message, string CorrelationId);
public sealed class CsvInputException(string code, string message, int status = 400) : Exception(message)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
}

public sealed class SalesCsvParser
{
    public const int MaxBytes = 100 * 1024;
    public const int MaxRows = 10;
    public const int MaxRequestBytes = 150 * 1024;
    public static readonly string[] Headers = ["Order ID", "Date", "Customer Code", "Customer", "Product Code",
        "Product", "Qty", "Unit Price", "Discount", "Currency"];

    public ParseSalesResult Parse(ParseSalesRequest request, string correlationId)
    {
        // [1] Giới hạn của bài học, không phải giới hạn dịch vụ Azure.
        if (request == null || !Regex.IsMatch(request.FileName ?? "", @"^Sales_\d{4}_(0[1-9]|1[0-2])\.csv$"))
            throw new CsvInputException("FILE_NAME_INVALID", "Tên file phải là Sales_YYYY_MM.csv.");
        foreach (var key in new[] { request.BatchKey, request.RunId })
            if (!Regex.IsMatch(key ?? "", @"^[A-Za-z0-9_-]{1,80}$"))
                throw new CsvInputException("KEY_INVALID", "BatchKey/RunId chỉ gồm chữ, số, gạch ngang/gạch dưới; tối đa 80 ký tự.");
        if (string.IsNullOrEmpty(request.CsvBase64)) throw new CsvInputException("CSV_EMPTY", "Chưa có nội dung CSV.");
        if (request.CsvBase64.Length > 4 * ((MaxBytes + 2) / 3))
            throw new CsvInputException("FILE_TOO_LARGE", "Bài học nhận tối đa 100 KiB.", 413);
        byte[] bytes;
        try { bytes = Convert.FromBase64String(request.CsvBase64); }
        catch (FormatException) { throw new CsvInputException("BASE64_INVALID", "Nội dung base64 không hợp lệ."); }
        if (bytes.Length > MaxBytes) throw new CsvInputException("FILE_TOO_LARGE", "Bài học nhận tối đa 100 KiB.", 413);
        // [2] Hash trên bytes nguồn trước khi bỏ BOM/parse; UTF-8 sai không được sửa âm thầm.
        var hash = Convert.ToHexStringLower(SHA256.HashData(bytes));
        string csv;
        try { csv = new UTF8Encoding(false, true).GetString(bytes).TrimStart('\uFEFF'); }
        catch (DecoderFallbackException) { throw new CsvInputException("ENCODING_INVALID", "CSV phải là UTF-8 hợp lệ."); }
        try {
            using var reader = new StringReader(csv);
            using var parser = new TextFieldParser(reader) {
                TextFieldType = FieldType.Delimited, HasFieldsEnclosedInQuotes = true, TrimWhiteSpace = false
            };
            parser.SetDelimiters(",");
            var headers = parser.ReadFields();
            if (headers == null || !headers.SequenceEqual(Headers))
                throw new CsvInputException("HEADER_INVALID", "CSV sai tên hoặc thứ tự 10 cột bắt buộc.");
            var rows = new List<RawSalesRow>();
            while (!parser.EndOfData) {
                var values = parser.ReadFields();
                if (values == null || values.Length != Headers.Length)
                    throw new CsvInputException("COLUMN_COUNT_INVALID", "Dòng CSV sai số cột.");
                if (rows.Count >= MaxRows) throw new CsvInputException("ROW_LIMIT", "Bài học nhận tối đa 10 dòng.");
                // [3] Qty/date vẫn là raw string: kiểm tra chất lượng thuộc Silver.
                rows.Add(new RawSalesRow(rows.Count + 1, Headers.Zip(values).ToDictionary(x => x.First, x => x.Second)));
            }
            if (rows.Count == 0) throw new CsvInputException("CSV_EMPTY", "CSV chưa có dòng dữ liệu.");
            return new ParseSalesResult(hash, rows.Count, correlationId, rows);
        } catch (MalformedLineException) {
            throw new CsvInputException("CSV_INVALID", "CSV có dấu nháy hoặc cấu trúc dòng không hợp lệ.");
        }
    }
}
