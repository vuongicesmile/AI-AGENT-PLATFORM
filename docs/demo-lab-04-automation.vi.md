# Bài 8: nối luồng dữ liệu bằng Automate và thêm Service Bus

[Về lộ trình](demo-learning-guide.vi.md). Bài này dùng những phần bạn đã làm: custom page, parser connector và Custom API tính Gold. Giữ Power Query/Dataflow cho Silver như `plan.md`.

## 8.1. Tạo ít flow, mỗi flow có một đầu việc

| Tên đề xuất | Trigger | Công việc |
| --- | --- | --- |
| `PA_Sales_Intake` | PipelineBatch được sửa thành Requested | Kiểm tra file, gọi parser, ghi Bronze, yêu cầu refresh Dataflow |
| `DF_Sales_BronzeToSilver` | Refresh được Intake yêu cầu | Chuẩn hóa raw thành Silver, giữ cả dòng Error |
| `PA_Sales_OnSilverCompleted` | Dataflow refresh completes | Xác minh đúng lần refresh, đọc Silver, gọi plugin, đối soát và hoàn tất batch |
| `PA_Sales_Watchdog` | Service Bus nhận WatchdogTick | Tìm batch chạy quá lâu và lưu cảnh báo |

Dataflow không phải cloud flow; nó xuất hiện trong bảng để bạn thấy bước nằm giữa hai flow. Trước hết chỉ cho **một batch đang xử lý**; không bật lịch refresh riêng hay bấm refresh tay trong lúc pipeline chạy. Đây là giới hạn bài học, chưa phải cơ chế lock nhiều worker của kế hoạch đầy đủ.

## 8.2. Intake: từng action và ý nghĩa

Tạo Automated cloud flow **bên trong solution**, sử dụng connection references cho Dataverse, Google Drive, Power Query Dataflows và Sales Demo API.

### Cấu hình trigger

1. Chọn Dataverse **When a row is added, modified or deleted**.
2. Change type **Modified**, table **SDP Pipeline Batch**, scope phù hợp tài khoản flow; trong lab có thể Organization nếu tài khoản được cấp quyền tương ứng.
3. **Select columns**: `sdp_status`.
4. **Filter rows**: `sdp_status eq 'Requested'` vì Status hiện là Text.
5. Bật trigger concurrency = **1** cho intake. Apply to each ghi row cũng chạy tuần tự trong bài học.

Select columns giúp giảm số event, không bảo đảm giá trị cũ khác giá trị mới hoặc chỉ chạy một lần. Flow phải đọc lại batch và kiểm tra trạng thái. [Microsoft: Dataverse trigger](https://learn.microsoft.com/en-us/power-automate/dataverse/create-update-delete-trigger).

### Scope TRY

| Bước | Action / cấu hình | Vì sao cần? |
| --- | --- | --- |
| I01 | Get a row by ID theo Batch ID từ trigger | Dùng trạng thái hiện tại, không xử lý mù payload trigger cũ |
| I02 | Nếu Status không còn Requested thì kết thúc nhánh | Một event lặp không được bắt đầu lại batch đã chạy |
| I03 | List rows tìm batch khác đang Processing/Transforming/Calculating | Nếu đang có batch khác: lưu thông báo Busy, để yêu cầu chờ; bài học gửi lại sau khi batch trước kết thúc |
| I04 | Kiểm tra BatchKey, RunKey, URL; chỉ nhận HTTPS và đúng hostname `drive.google.com` cùng dạng `/file/d/...` | Validation server độc lập với JS; không dùng contains(host) |
| I05 | Update batch: Status Processing, StartedOn = `utcNow()`; giữ nguyên RunKey đã tạo | Đánh dấu thời điểm bắt đầu để theo dõi và watchdog |
| I06 | Tách File ID từ URL đã hợp lệ; Google Drive **Get file metadata using id** | Kiểm tra quyền đọc, tên/loại file và giới hạn demo |
| I07 | Google Drive **Get file content using id** | Đọc bytes CSV bằng đúng connection |
| I08 | Gọi custom connector **ParseSalesCsv** với FileName, BatchKey, RunId, csvBase64 | Nhận FileHash, rowCount và các dòng raw từ bài 6–7 |
| I09 | Đọc lại metadata nguồn; nếu file đổi trong lúc đọc thì fail và yêu cầu file ổn định | Tránh coi dữ liệu hai phiên bản là cùng một batch |
| I10 | Nếu batch đã có FileHash từ lần thử trước, so với hash mới; khác thì dừng và tạo batch mới | Retry không được âm thầm đổi nguồn dưới cùng BatchKey |
| I11 | Apply to each `rows`, kiểm tra RecordKey rồi tạo Bronze nếu chưa có | Không nhân đôi dòng khi action được thử lại |
| I12 | Đọc Bronze theo BatchKey, đếm/đối chiếu với rowCount | Ghi BronzeCount sau khi kiểm chứng, không cộng mù theo số action |
| I13 | Ghi FileHash, FileName, Drive ID và metadata vào Batch | Người đọc biết file nào đã được xử lý |
| I14 | Ghi Status Transforming, SilverRunKey = RunKey, SilverRequestedOn = `utcNow()` | Lưu dấu mốc để callback Dataflow đối chiếu |
| I15 | Power Query Dataflows **Refresh a dataflow**: group type Environment, đúng environment và Dataflow ID | Yêu cầu refresh; chưa tính Gold tại đây |

I03: để bài đầu dễ quan sát, không xây queue xử lý file thứ hai. Người học chờ batch đang chạy kết thúc, làm mới yêu cầu còn chờ rồi chuyển New → Requested một lần nữa. Không thay RunKey của batch đang hoạt động. Production dùng dispatcher/lease có kiểm soát như kế hoạch tổng thể.

I14 cần thêm hai cột **đề xuất** trên PipelineBatch: `sdp_silverrunkey` Text và `sdp_silverrequestedon` Date and time. Cùng `sdp_startedon`, đây là các cột cần tạo khi triển khai bài; hiện chưa có trong snapshot.

### Mapping Bronze ở I11

| Cột Bronze | Giá trị |
| --- | --- |
| `sdp_name` | RecordKey hoặc Order ID, phải có giá trị kể cả Order ID bị rỗng |
| `sdp_batchkey` | BatchKey đang xử lý |
| `sdp_recordkey` | BatchKey + `-r` + rowNumber đã pad, ví dụ `demo01-r0001` |
| `sdp_rownumber` | `item()?['rowNumber']` |
| `sdp_orderid` | `item()?['values']?['Order ID']` |
| `sdp_rawjson` | `string(item()?['values'])` |
| `sdp_loadstatus` | `Loaded` |

Trước Create, List rows theo RecordKey, lấy tối đa 2 để phát hiện dữ liệu trùng bất thường. Nếu đã có đúng một row, so nội dung raw và BatchKey: giống thì bỏ qua, khác thì lỗi. Nếu Create gặp conflict do delivery lặp, đọc lại và đối chiếu; không bỏ qua mọi lỗi. Alternate key Active là lớp bảo vệ cuối. Bronze đã có không được update nội dung raw khi retry.

### Scope CATCH

1. Tạo Scope CATCH, **Configure run after** TRY failed/timed out.
2. Giữ BatchKey/RunKey ngay từ đầu, để URL sai cũng tạo được lỗi. Bảng PipelineError yêu cầu **Name, BatchKey, RecordKey**; map đủ cả ba.
3. Ghi Layer tương ứng, ErrorType, ErrorMessage gọn, SourceRecordId khi có; dùng key có RunKey để không ghi đè lỗi của lần thử trước.
4. Lỗi chắc chắn trước khi submit Dataflow: cập nhật batch Failed. Refresh đã submit nhưng timeout/không rõ kết quả: giữ batch ở trạng thái đang chờ, ghi `RefreshOutcomeUnknown` và kiểm tra refresh terminal trước khi retry; không thả batch tiếp theo vào cùng Dataflow.
5. Không để lỗi của CATCH che mất lỗi gốc. Nếu ghi PipelineError cũng thất bại, Run history là bằng chứng dự phòng phải được kiểm tra.

## 8.3. Dataflow: Bronze sang Silver

### Tạo query nguồn

1. Trong Power Apps, mở **Dataflows → New dataflow**, đặt `DF_Sales_BronzeToSilver`, chọn standard dataflow ghi vào Dataverse.
2. Kết nối Dataverse cùng environment. Dùng navigator chọn Bronze và PipelineBatch; không tự đoán tên entity set/OData URL. Đặt tên query nguồn `BronzeSource` và `BatchSource`.
3. Tạo query chọn batch có Status Transforming. Nếu không đúng **một** batch, làm query thất bại có thông báo; không lấy tùy tiện dòng đầu tiên.
4. Join/filter Bronze theo BatchKey vừa chọn. Tắt load cho query phụ; chỉ query kết quả Silver được nạp.

Khung M để chọn phạm vi, dùng sau khi đã có hai query nguồn từ navigator:

```powerquery
let
    // Chọn đúng batch mà Intake đã đưa sang Transforming.
    Active = Table.SelectRows(BatchSource, each [sdp_status] = "Transforming"),
    BatchKey = if Table.RowCount(Active) = 1
               then Active{0}[sdp_batchkey]
               else error "Bài học yêu cầu đúng một batch Transforming.",
    Rows = Table.SelectRows(BronzeSource, each [sdp_batchkey] = BatchKey)
in
    Rows
```

Tên cột trong query có thể theo lựa chọn navigator. Nếu không phải logical name ở trên, đổi tên/cập nhật tham chiếu theo bước Source thực tế; không sửa endpoint để đoán.

### Chuẩn hóa từng cột và giữ lỗi

5. Add Column **Raw**: `try Json.Document([sdp_rawjson]) otherwise null`. Tạo cột cờ lỗi nếu Raw null.
6. Đọc các ô từ Raw bằng `try Record.Field(...) otherwise null`; giữ OrderId, CustomerCode, ProductCode riêng với tên mô tả.
7. Qty/Price dùng `Number.FromText(..., "en-US")`; ngày dùng `Date.FromText(..., [Format="dd/MM/yyyy", Culture="en-GB"])`; bọc `try ... otherwise null` để một dòng lỗi không làm biến mất cả lô.
8. Discount phải có `%`; bỏ đúng ký tự cuối rồi parse số/chia 100. `5% → 0.05`; `abc%` hoặc `5` không theo contract thì đánh dấu lỗi.
9. Trim các mã/tên, uppercase Currency. Kiểm tra USD và mã customer/product tồn tại, active trong fixture đã ghim cho bài. Query master có thể đọc JSON cấu hình qua bảng environment variable; chỉ lấy cấu hình cần dùng, không credential.
10. Tạo query Group By OrderId trong **cùng batch**, đếm số dòng, merge lại. Nếu OrderId rỗng/trùng thì đánh dấu tất cả dòng liên quan Error; vẫn giữ từng RecordKey theo row number.
11. Kiểm tra đủ OrderId, ngày hợp lệ, Quantity > 0, UnitPrice ≥ 0 và DiscountPct trong [0, 1], cùng các lỗi master/currency/trùng ở trên. Tạo DataQualityMessage từ tất cả lỗi; chỉ đặt DataQualityStatus = `Valid` khi không có lỗi, còn lại là `Error`. Các cột số/ngày không parse được để null; số parse được nhưng sai miền, như Qty = -1, vẫn giữ -1 để điều tra. Không thay lỗi thành số 0 rồi đánh dấu Valid.
12. Tính GrossAmount/DiscountAmount/NetAmount để quan sát Silver. Plugin ở Gold vẫn tính lại bằng decimal; đối soát sai số/làm tròn trước khi công bố.

| Đích Silver | Nguồn / xử lý |
| --- | --- |
| Name, BatchKey, RecordKey | Giữ lineage từ Bronze, Name fallback RecordKey |
| OrderId, OrderDate | Raw Order ID, Date đã parse theo dd/MM/yyyy |
| CustomerCode, CustomerName | Raw code/name sau trim và kiểm tra fixture |
| ProductCode, ProductName | Raw code/name sau trim và kiểm tra fixture |
| Quantity, UnitPrice, DiscountPct | Decimal/nullable theo quy tắc trên |
| Currency | USD trong bài học |
| GrossAmount, DiscountAmount, NetAmount | Giá trị tính sau validation, null khi chưa đủ đầu vào |
| DataQualityStatus, DataQualityMessage | Kết quả kiểm tra từng dòng |

### Map và chạy thử

13. **Load to existing table → SDP Sales Silver**, map từng cột theo logical/display names đã xác minh ở lộ trình.
14. Chọn key **sdp_recordkey** để upsert. Không chọn OrderId làm key vì sẽ làm mất bằng chứng các dòng OrderId trùng.
15. Không bật **Delete rows that no longer exist in query output**: output chỉ có batch hiện tại, không được xóa Silver của batch trước.
16. Các cột số/ngày cần nullable để giữ dòng Error. Plugin validation bài 5 chỉ chặn một dòng sai bị ghi là Valid, nên không phá cơ chế lưu lỗi.
17. Save, lấy Dataflow ID thực tế và cấu hình I15. Khi kiểm thử riêng lần đầu, dùng một batch mới cùng Bronze fixture; sau đó để flow sở hữu refresh.

[Microsoft: key/upsert và mapping của standard dataflow](https://learn.microsoft.com/en-us/power-query/dataflows/get-best-of-standard-dataflows).

## 8.4. Callback Dataflow: đợi xong mới tính Gold

Action Refresh không có tham số tự do BatchId/RunId. Trigger completion có Dataflow ID, startTime, endTime và status. Vì vậy phải đối chiếu với thông tin đã lưu trên Batch. [Contract connector](https://learn.microsoft.com/en-us/connectors/dataflows/).

1. Tạo `PA_Sales_OnSilverCompleted`, trigger **When a dataflow refresh completes**, chọn đúng environment/Dataflow. Đặt concurrency **1** để xử lý completion tuần tự.
2. Đọc batch Transforming; phải đúng một batch. Kiểm tra `sdp_silverrunkey == sdp_runkey` và startTime của event không cũ hơn SilverRequestedOn. Callback cũ/không rõ correlation phải dừng và ghi dấu điều tra, không áp lên batch khác.
3. Nếu status **Failed/Cancelled**, ghi PipelineError, chỉ cập nhật batch tương ứng sau khi xác định refresh đã terminal.
4. Nếu **Success**, List rows Silver theo BatchKey, bật pagination khi cần; đếm tổng, đếm Valid/Error và đối chiếu BronzeCount. Refresh success không tự chứng minh đủ dòng.
5. Mỗi Silver Error tạo/upsert PipelineError. Nếu có dòng Error hoặc số dòng không khớp, batch Failed, không tạo Gold cho lô lỗi trong chính sách bài học.
6. Tất cả dòng Valid: chuyển batch **Calculating**, giữ RunKey.
7. Apply to each Silver tuần tự → Dataverse **Perform an unbound action** → `sdp_CalculateSalesGold`, truyền SilverRecordId, BatchId, RunId.
8. Action/plugin lỗi: Scope Catch lưu lỗi, đánh dấu batch Failed. Gold đã tính trước đó còn Candidate; không xóa để che lỗi hoặc coi một phần đó là báo cáo hoàn chỉnh.
9. Sau khi tất cả API thành công, đọc lại Gold theo BatchKey, đối soát số row, RecordKey và tổng tiền với Silver/kết quả kỳ vọng.
10. Đối soát pass: đặt Gold của batch Ready rồi mới cập nhật batch **Completed**, GoldCount và ProcessedOn. Khi một bước finalization lỗi, giữ batch chưa Completed và điều tra/retry có kiểm soát.

**Cổng xem dữ liệu:** custom page/Power BI chỉ hiển thị số liệu cuối khi **batch Completed và Gold Ready**. Chỉ lọc Ready là chưa đủ, vì việc update nhiều dòng Gold và batch không phải một transaction duy nhất. Mở bảng Gold thô vẫn có thể thấy Candidate phục vụ vận hành.

Không dùng Delay cố định 30 giây để giả định Dataflow đã xong. Thiết kế bài học dựa vào một refresh đang hoạt động, không có refresh tay và input/run key được giữ nguyên. Muốn chạy nhiều batch, phải nâng lên control/lease/attempt correlation trong kế hoạch tổng thể; cần kiểm thử callback thật trước khi tuyên bố hoàn tất.

## 8.5. Service Bus: một ví dụ nhỏ có tác dụng thật

**Tình huống:** batch bị kẹt ở Transforming, bạn chưa mở app nên không biết. Timer định kỳ gửi một tín hiệu. Queue giữ tín hiệu khi flow đang tạm ngừng. Flow nhận tín hiệu rồi kiểm tra các batch quá thời gian demo.

### Tạo queue khi triển khai phần Azure

1. Trong Azure, tạo namespace Service Bus và queue **sdp-demo-watchdog** ở subscription/region dev đã chọn. Chọn tier đáp ứng queue cần dùng; bài này chưa cần topic/session/duplicate-detection của broker.
2. Đặt lock duration thử nghiệm 2 phút, MaxDeliveryCount 5, TTL theo thời gian giữ tín hiệu phù hợp bài thử. Đây là cấu hình lab, cần đo trước khi dùng lâu dài.
3. Bật managed identity của Function App và cấp **Azure Service Bus Data Sender** ở phạm vi queue/namespace phù hợp.
4. Power Automate tạo Service Bus connection bằng tài khoản Entra có **Data Receiver** hoặc credential được cho phép; giữ trong connection reference. Managed identity của connector hiện áp dụng cho Logic Apps, không mặc định có trong Power Automate.
5. Cấu hình Function: `ServiceBusNamespace` là hostname thực tế dạng `...servicebus.windows.net`, `WatchdogQueue = sdp-demo-watchdog`, `WatchdogSchedule = 0 */5 * * * *`.

[Microsoft: Service Bus connector và authentication](https://learn.microsoft.com/en-us/connectors/servicebus/).

### Cho Timer gửi message

Trong project Function, thêm packages **Azure.Messaging.ServiceBus** và **Azure.Identity**. Đăng ký một `ServiceBusClient` dùng chung trong phần DI của `Program.cs`; giữ code khởi tạo host do template tạo:

```csharp
// Đặt trước builder.Build().Run(); dùng builder tương ứng template isolated của bạn.
builder.Services.AddSingleton(_ => new Azure.Messaging.ServiceBus.ServiceBusClient(
    Environment.GetEnvironmentVariable("ServiceBusNamespace")
        ?? throw new InvalidOperationException("Thiếu ServiceBusNamespace"),
    new Azure.Identity.DefaultAzureCredential()));
```

Thêm `using Microsoft.Extensions.DependencyInjection;` nếu template chưa có. Local cần đăng nhập identity có quyền Sender; khi lên Azure, DefaultAzureCredential dùng managed identity theo cấu hình thực tế. Không đặt connection string/key trong class.

Thay class Timer chỉ log ở bài 6 bằng mẫu sau; đây vẫn là cùng một function, không giữ hai class có cùng Function name:

```csharp
using System;
using System.Threading.Tasks;
using Azure.Messaging.ServiceBus;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

public sealed class WatchdogTimer
{
    private readonly ServiceBusClient _bus;
    public WatchdogTimer(ServiceBusClient bus) { _bus = bus; }

    [Function("WatchdogTimer")]
    public async Task Run(
        [TimerTrigger("%WatchdogSchedule%", RunOnStartup = false)] TimerInfo timer,
        FunctionContext context)
    {
        var queue = Environment.GetEnvironmentVariable("WatchdogQueue")
            ?? throw new InvalidOperationException("Thiếu WatchdogQueue");
        await using var sender = _bus.CreateSender(queue);
        var tickId = Guid.NewGuid().ToString("N");

        // Tín hiệu nhỏ, không đưa cả CSV hoặc token vào message.
        var message = new ServiceBusMessage(BinaryData.FromObjectAsJson(new {
            kind = "WatchdogTick", tickId, sentAtUtc = DateTime.UtcNow
        })) { MessageId = tickId, ContentType = "application/json" };

        await sender.SendMessageAsync(message);
        context.GetLogger("WatchdogTimer").LogInformation("Sent tick {TickId}", tickId);
    }
}
```

### Flow PA_Sales_Watchdog

1. Trigger Service Bus **When a message is received in a queue (peek-lock)**, chọn queue sdp-demo-watchdog. Bài đầu nhận từng message và concurrency 1.
2. Xem trigger output; decode ContentData/base64 theo schema thực tế rồi Parse JSON. Chỉ nhận `kind = WatchdogTick`, tickId hợp lệ.
3. List rows PipelineBatch có Status Processing/Transforming/Calculating và StartedOn cũ hơn **15 phút**. 15 phút chỉ là ngưỡng demo có cấu hình, không phải SLA đã được duyệt.
4. Với mỗi batch, lấy RunKey hiện tại và tạo cảnh báo `ProcessingTooLong`. Error RecordKey là `BatchKey-RunKey-watchdog`: nhiều tick cho cùng lần chạy vẫn chỉ có một cảnh báo.
5. Trước khi ghi cảnh báo, đọc lại batch; nếu đã Completed/Failed hoặc RunKey đã đổi thì bỏ qua. Watchdog không đổi trạng thái xử lý và không tự khởi chạy lần thử mới.
6. Ghi/upsert PipelineError thành công xong mới **Complete the message in a queue**, dùng đúng LockToken từ trigger.
7. Lỗi tạm thời: **Abandon the message in a queue** để delivery lại. Message sai schema không thể sửa bằng retry: **Dead-letter the message in a queue**, ghi reason. Sau MaxDeliveryCount có thể vào DLQ; cần người đọc DLQ và xử lý.
8. Nếu xử lý sắp vượt thời gian lock, renew lock theo action connector hoặc giảm công việc mỗi message. Lock mất thì không coi Complete là thành công; lần giao lại phải xử lý idempotent.
9. Chỉ thêm gửi email sau khi chốt người nhận và quy tắc chống trùng thông báo. Lưu PipelineError đủ để thấy cảnh báo trong bài học; không dùng Teams theo constraint repo.

**Peek-lock nghĩa là:** nhận để xử lý nhưng chưa xóa. Complete là xác nhận đã xử lý xong. Không chọn auto-complete nếu muốn tự kiểm soát mất/lặp message. Hàng đợi không bảo đảm mọi thao tác Dataverse chỉ xảy ra đúng một lần; business key của cảnh báo giúp xử lý lặp an toàn. [Microsoft: tránh mất và xử lý trùng message](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-message-loss-and-duplicates).

## 8.6. Demo thử từ đầu đến cuối

| Lần thử | Thao tác | Kết quả cần thấy |
| --- | --- | --- |
| 1. Chuẩn | Batch mới + CSV 10 dòng; bấm Gửi xử lý | Bronze 10, Silver 10 Valid, Gold 10, Completed |
| 2. Link sai | URL sai host hoặc file không có quyền | Failed + lỗi Intake, không tự bỏ qua lỗi |
| 3. Qty sai | Tạo file/batch mới với Qty `abc` hoặc âm | Raw vẫn ở Bronze; Silver Error; batch Failed; không công bố Gold |
| 4. OrderId trùng | Hai row cùng SO001 | Cả hai giữ RecordKey riêng và bị đánh dấu lỗi |
| 5. API gọi lặp | Gọi lại cùng Silver trong batch Calculating thử nghiệm | Gold không tăng số dòng |
| 6. Refresh chậm | Quan sát batch Transforming lâu | Chưa chạy Gold trước callback; watchdog chỉ cảnh báo |
| 7. Queue giao lặp | Gửi hai tick hoặc gây abandon | Một cảnh báo theo BatchKey/RunKey; Complete sau ghi thành công |
| 8. Publish/deploy | Publish artifact vừa làm rồi export snapshot | Diff thấy đúng component; không dựa vào batch Completed để kết luận deployment |

Retry chỉ làm sau khi xác nhận worker/refresh cũ đã dừng. Giữ raw/master/rule của batch, đổi RunKey cho lần thử và giữ RecordKey của row. File/rule đã đổi thì tạo batch mới. Những bài thử lỗi không dùng dữ liệu thật hoặc batch đang phục vụ người dùng khác.

Cuối buổi, chạy `python scripts/power_platform_status.py`, kiểm tra log, rồi export/unpack snapshot mới như [runbook PAC](pac-connection-status.vi.md). **Thiết kế này chưa được deploy hoặc chạy end-to-end**; chỉ đánh dấu bài pass sau khi bạn có đúng bằng chứng ở cột kết quả.
