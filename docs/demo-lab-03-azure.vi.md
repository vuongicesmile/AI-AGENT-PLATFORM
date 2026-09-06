# Bài 6–7: Azure Function, lịch chạy và custom connector

[Về lộ trình](demo-learning-guide.vi.md). Đọc bài này như một thiết kế triển khai: chưa có Function App hoặc Service Bus được tạo trong tài khoản Azure của bạn.

## Bài 6 — Azure Functions HTTP và Timer

### 6.1. Hai trigger, hai nhiệm vụ

| Function | Trigger | Input | Output | Tác dụng |
| --- | --- | --- | --- | --- |
| `ParseSalesCsv` | HTTP POST | Bytes CSV dưới dạng base64, BatchKey, RunId, FileName | FileHash và mảng dòng raw | Đọc CSV đúng cả khi có dấu phẩy trong dấu nháy |
| `WatchdogTimer` | Timer | Lịch cấu hình | Tín hiệu `WatchdogTick` vào queue | Nhắc hệ thống kiểm tra batch chạy lâu |

HTTP Function không tính Gold, không ghi Dataverse. Timer cũng không tự retry batch hoặc đọc Google Drive. Mỗi phần có một việc để bạn dễ tìm lỗi.

### 6.2. Tạo project local

1. Chuẩn bị .NET SDK, Azure Functions extension cho VS Code, Functions Core Tools và Azurite để chạy host storage local.
2. Trong VS Code, dùng **Azure Functions: Create New Project**, chọn thư mục mới bên dưới `repositories/rmit-fm-integrations`.
3. Chọn **C# → .NET isolated → HTTP trigger**, tên `ParseSalesCsv`, Authorization **Function**. Theo tài liệu hiện tại, chọn .NET 10 trên hosting hỗ trợ; project plugin Dataverse vẫn là project .NET Framework riêng.
4. Giữ cấu trúc `Program.cs`, `host.json` và project do template tạo. Không trộn `Microsoft.Azure.WebJobs` của in-process với `Microsoft.Azure.Functions.Worker` của isolated.
5. Tạo `local.settings.json` theo template; lưu secrets ở đây khi chạy local và bảo đảm file bị Git ignore. `AzureWebJobsStorage = UseDevelopmentStorage=true` yêu cầu Azurite đang chạy.
6. Dùng F5/`func start` để chạy local. Xem URL thực tế do host in ra; cổng thường là 7071 nhưng lấy theo output của máy bạn.

Microsoft hướng dẫn [isolated worker](https://learn.microsoft.com/en-us/azure/azure-functions/dotnet-isolated-process-guide). .NET 10 trên Linux cần hosting phù hợp, ví dụ Flex Consumption; không chọn Linux Consumption cũ rồi giả định mọi runtime đều chạy được. Phần tạo resource Azure cần subscription, region và quyền đã xác định khi triển khai.

### 6.3. Định nghĩa hợp đồng HTTP trước khi viết code

**POST `/api/parse-sales-csv`**, Content-Type `application/json`:

```json
{
  "fileName": "Sales_2026_08.csv",
  "batchKey": "demo01",
  "runId": "run01",
  "csvBase64": "<base64-cua-bytes-file>"
}
```

Base64 giúp truyền bytes qua JSON và giữ được hash của file gốc. Nó không phải mã hóa bảo mật. Không băm chuỗi đã Trim/đổi newline rồi gọi đó là hash file nguồn.

Response **200**, minh họa một dòng:

```json
{
  "fileHash": "<sha256-hex-cua-file>",
  "rowCount": 1,
  "correlationId": "<id-lan-goi-function>",
  "rows": [
    {
      "rowNumber": 1,
      "values": {
        "Order ID": "SO001", "Date": "01/08/2026",
        "Customer Code": "C001", "Customer": "ABC Ltd",
        "Product Code": "P001", "Product": "Laptop",
        "Qty": "2", "Unit Price": "1000", "Discount": "5%", "Currency": "USD"
      }
    }
  ]
}
```

Response **400** cho header/CSV không hợp lệ:

```json
{"code":"CSV_INVALID","message":"CSV thiếu cột Qty.","correlationId":"<id-lan-goi>"}
```

Response **413** khi vượt giới hạn kích thước bytes; lỗi vượt số dòng của parser trả **400**. Lỗi server bất ngờ trả **500** với CorrelationId, ghi exception đầy đủ trong log nội bộ. Không trả 200 kèm `success:false` cho lỗi parse vì caller dễ coi action là thành công.

### 6.4. Các bước xử lý bên trong HTTP handler

1. Đọc JSON theo contract; kiểm tra thiếu field, tên file theo `Sales_YYYY_MM.csv`, BatchKey/RunId theo quy ước demo.
2. Kiểm tra chiều dài request/base64 trước khi cấp phát lớn; decode bytes. Giới hạn **đề xuất bài học**: 100 KiB, 1–10 dòng. Đây là giới hạn tự đặt để học, không phải giới hạn của Azure hay Google Drive.
3. Tính `SHA256` trên bytes trước khi decode UTF-8. Đọc UTF-8 có kiểm tra lỗi; bỏ BOM đầu chuỗi khi parse, nhưng hash vẫn giữ bytes gốc.
4. Dùng CSV parser, kiểm tra đúng 10 header. Không `Split(',')` hoặc `Split('\n')`: một ô hợp lệ có thể chứa dấu phẩy hoặc xuống dòng trong dấu nháy.
5. Gán `rowNumber` theo bản ghi CSV logic, bắt đầu từ 1 sau header.
6. Giữ các giá trị raw dạng string. Qty/date/discount sẽ được chuẩn hóa ở Silver, vì vậy Qty `abc` vẫn phải đi được vào Bronze để có bằng chứng lỗi.
7. Trả JSON theo response đã định nghĩa. Handler cần bắt cả `FormatException` và `Microsoft.VisualBasic.FileIO.MalformedLineException` từ parser để trả lỗi CSV 400; dấu nháy sai không phải lỗi server 500. Thiết lập serializer trả đúng camelCase; không để connector chờ `rowNumber` trong khi backend trả `RowNumber`.
8. Log BatchKey, RunId, CorrelationId, byte count, row count và duration. Không log base64, toàn bộ CSV hoặc function key.

Đoạn parser minh họa để đặt vào service của Function; HTTP handler vẫn cần thực hiện các bước giới hạn, hash, response/error ở trên:

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.VisualBasic.FileIO;

public static class CsvRows
{
    public static List<Dictionary<string, string>> Read(string csvText)
    {
        // [1] Các header có sẵn trong CSV của repo.
        string[] expected = {
            "Order ID", "Date", "Customer Code", "Customer", "Product Code",
            "Product", "Qty", "Unit Price", "Discount", "Currency"
        };
        using var reader = new StringReader(csvText.TrimStart('\uFEFF'));
        using var parser = new TextFieldParser(reader);
        parser.TextFieldType = FieldType.Delimited;
        parser.SetDelimiters(",");
        parser.HasFieldsEnclosedInQuotes = true; // [2] Đọc được "ABC, Ltd".
        parser.TrimWhiteSpace = false;           // [3] Chưa chuẩn hóa dữ liệu raw.

        var header = parser.ReadFields();
        if (header == null || !header.SequenceEqual(expected))
            throw new FormatException("CSV sai tên hoặc thứ tự header.");

        var rows = new List<Dictionary<string, string>>();
        while (!parser.EndOfData)
        {
            var values = parser.ReadFields();
            if (values == null || values.Length != expected.Length)
                throw new FormatException("CSV có dòng sai số cột.");
            if (rows.Count >= 10) throw new FormatException("Bài học chỉ nhận tối đa 10 dòng.");
            var row = new Dictionary<string, string>();
            for (int i = 0; i < expected.Length; i++) row[expected[i]] = values[i];
            rows.Add(row);
        }
        if (rows.Count == 0) throw new FormatException("CSV không có dữ liệu.");
        return rows; // Handler bọc thành {rowNumber, values} rồi trả JSON.
    }
}
```

`TextFieldParser` bỏ qua dòng trống; bài học không tính dòng trống là sales record. RawJson ở Bronze là nội dung các ô đã parse, không phải bản sao từng byte của file. [Microsoft: TextFieldParser](https://learn.microsoft.com/en-us/dotnet/api/microsoft.visualbasic.fileio.textfieldparser).

### 6.5. Test HTTP trên local

Sau khi hoàn thiện handler và host đã chạy, mở terminal khác tại root repo:

```powershell
# [1] Đọc bytes file thật trong repo.
$csvPath = (Resolve-Path data\sample_sales_2026_08.csv).Path
$csvBytes = [System.IO.File]::ReadAllBytes($csvPath)
# [2] Tên file gửi lên API theo convention của demo.
$payload = @{
    fileName = 'Sales_2026_08.csv'
    batchKey = 'demo01'
    runId = 'run01'
    csvBase64 = [Convert]::ToBase64String($csvBytes)
} | ConvertTo-Json
# [3] Thay URL nếu host local in ra cổng/route khác.
Invoke-RestMethod -Method Post -Uri 'http://localhost:7071/api/parse-sales-csv' -ContentType 'application/json' -Body $payload
```

Kiểm tra 10 dòng chuẩn, quoted comma, quoted newline, UTF-8 BOM, header thiếu, ô rỗng, Qty sai kiểu và file quá giới hạn. Azure Functions local thường không thực thi key auth như cloud; test local pass chưa chứng minh cloud auth đúng.

### 6.6. Thêm Timer

1. Tạo thêm function **Timer trigger** trong cùng project, tên `WatchdogTimer`.
2. Đặt `WatchdogSchedule = 0 */5 * * * *` trong local settings/application settings: mỗi 5 phút, tại giây 0. NCRONTAB của Functions có **6 trường**; mặc định dùng UTC.
3. Trước tiên chỉ ghi log để hiểu timer. Không cần gọi Dataverse hoặc tạo queue ngay.

```csharp
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

public static class WatchdogTimer
{
    [Function("WatchdogTimer")]
    public static void Run(
        [TimerTrigger("%WatchdogSchedule%", RunOnStartup = false)] TimerInfo timer,
        FunctionContext context)
    {
        // Dấu %...% yêu cầu runtime đọc lịch từ cấu hình.
        var log = context.GetLogger("WatchdogTimer");
        log.LogInformation("Watchdog tick. InvocationId={Id}; PastDue={PastDue}",
            context.InvocationId, timer.IsPastDue);
    }
}
```

4. Chạy local có Azurite, chờ một nhịp hoặc đặt lịch nhanh hơn tạm thời khi test rồi trả về 5 phút.
5. Xem terminal/Application Insights. `RunOnStartup=false` tránh tự chạy thêm một nhịp chỉ vì host khởi động.
6. Ở bài 8 sẽ thay phần thân bằng gửi một message vào Service Bus. **Không tạo thêm timer thứ hai chạy cùng lịch cho cùng nhiệm vụ**.

[Microsoft: Timer trigger](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer).

### 6.7. Khi đưa Function lên Azure

1. Chọn subscription/resource group/region/hosting phục vụ dev; tạo Function App, host Storage và Application Insights theo template chính thức.
2. Deploy project đã build/test. Cấu hình ứng dụng trên Azure; `local.settings.json` không tự trở thành cloud configuration.
3. Lấy **hostname và route thực tế** của HTTP Function. Giữ AuthorizationLevel.Function cho bài học có dữ liệu giả và dùng **function-scoped key**; chỉ chia sẻ connector connection cho người học được phép. Function key không thay thế cơ chế phân quyền người dùng cho production.
4. Kiểm tra request thiếu key bị từ chối, key đúng nhận JSON đúng schema. Không đặt key trong JavaScript, URL của command hoặc source repo.
5. Khi cần danh tính riêng và quyền chi tiết, thiết kế Entra authentication cho API/connector. Chưa tự suy ra tenant đã có app registration/consent.

## Bài 7 — Custom connector gọi Function

**Hình dung:** API là cửa vào Function; connector đặt tên và mô tả các ô input/output để bạn sử dụng như action trong Automate.

### 7.1. Tạo connector từ giao diện

1. Chọn cùng environment với solution. Mở **Custom connectors → New custom connector → Create from blank**; tên `Sales Demo API`.
2. **General**: Scheme HTTPS, Host là hostname thật ở bước 6.7, Base URL `/api`.
3. **Security**: Authentication type **API key**, Parameter label `Function key`, Parameter name **x-functions-key**, Parameter location **Header**.
4. **Definition → New action**: Summary `Đọc CSV Sales`, Operation ID **ParseSalesCsv**.
5. **Request → Import from sample**: Verb POST, URL `https://<hostname-thật>/api/parse-sales-csv`, header Content-Type application/json, body theo bước 6.3 với các giá trị mẫu hợp lệ.
6. Đánh dấu fileName, batchKey, runId, csvBase64 là required; ghi description tiếng Việt cho từng input. Không tạo thêm parameter `x-functions-key` trong body: key do Security quản lý.
7. **Response → Add default response → Import from sample**: dùng JSON 200 mẫu có đủ `fileHash`, `rowCount`, `correlationId`, `rows[].rowNumber`, `rows[].values` và đủ 10 trường raw. Thêm response 400/413/500 theo contract để người đọc biết lỗi.
8. Save/Create connector; tạo **connection** bằng function-scoped key thật. Secret nằm trong connection, không trong definition.
9. Tab **Test**, chọn connection rồi gọi ParseSalesCsv với base64 lấy từ file sample. Kiểm tra `rowCount = 10` và `rows[0].values.Qty = "2"`.
10. Thêm custom connector vào solution qua **Add existing** nếu wizard tạo ngoài solution. Tạo **connection reference** dùng connector này cho các flow của demo.

Nếu dùng Import OpenAPI thay vì wizard, dùng **OpenAPI/Swagger 2.0** theo khả năng connector đã kiểm tra. Definition là mô tả API; import được definition không tạo backend Function. [Microsoft: connector từ định nghĩa](https://learn.microsoft.com/en-us/connectors/custom-connectors/define-openapi-definition), [connector từ đầu](https://learn.microsoft.com/en-us/connectors/custom-connectors/define-blank).

### 7.2. Thử trong một flow riêng trước khi ghép pipeline

1. Tạo instant flow `TEST_ParseSalesCsv` trong solution.
2. Thêm Google Drive **Get file content using id** hoặc dùng một input base64 fixture để test contract.
3. Xem raw output của action Drive: nếu có `$content` thì đó đã là base64, truyền đúng giá trị đó. Nếu đang có plain text CSV mới dùng `base64(...)`. Không encode một chuỗi base64 lần thứ hai.
4. Thêm **Sales Demo API → Đọc CSV Sales**, map bốn input.
5. Thêm Compose `rowCount` và chạy test. Mở Run history để nhìn input/output qua từng action.
6. Khi pass, dùng cùng connection reference trong flow xử lý batch ở bài 8.

### 7.3. Lỗi thường gặp

| Lỗi | Giải thích / cách kiểm tra |
| --- | --- |
| 401/403 | Sai key, sai header hoặc API có lớp auth khác; test trực tiếp API để tách lỗi |
| 404 | Host/base URL/route ghép sai, ví dụ `/api/api/parse-sales-csv` |
| Cloud connector không gọi được localhost | Localhost là máy chạy connector trên cloud, không phải laptop của bạn; cần endpoint dev đã triển khai hoặc phương án kết nối được phê duyệt |
| Output không có rows | Backend response khác schema; sửa definition/refresh action sau khi thay contract |
| DLP chặn nối Drive và Dataverse | Kiểm tra policy và người quản lý tenant; thay code không tự giải quyết policy |
| Function trả Qty sai vẫn 200 | Đúng ở tầng raw: kiểm tra chất lượng Qty thuộc Silver, không thuộc parser CSV |

**Bài đã đạt khi:** HTTP parser đọc đúng CSV, connector gọi được API với authentication, timer tạo log đúng lịch. Phần queue và phản ứng với batch chậm được hoàn tất ở bài 8.
