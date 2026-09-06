# Bài 5: plugin kiểm tra dữ liệu và tính Gold

[Về lộ trình](demo-learning-guide.vi.md). Bài này bắt đầu bằng **một dòng Silver nhập tay**, để bạn quan sát C# trước khi ghép Google Drive và Dataflow.

## 5.1. Plugin là gì trong demo này?

JavaScript chạy trên trình duyệt. Plugin chạy ở server Dataverse. Vì vậy, người dùng bỏ qua form rồi gọi API vẫn phải chịu quy tắc của plugin.

Ta dùng hai việc khác nhau để học:

| Plugin | Khi nào chạy? | Việc làm |
| --- | --- | --- |
| `ValidateSalesSilverPlugin` | Create/Update Silver | Không cho một dòng sai tự nhận là `Valid` |
| `CalculateSalesGoldPlugin` | Khi gọi Custom API `sdp_CalculateSalesGold` | Đọc Silver hợp lệ, lấy cost demo và upsert Gold |

**Tách hai việc để dễ hiểu:** lưu Silver không tự tính Gold trong bài học. Automate chủ động gọi API sau khi kiểm tra toàn bộ batch. Dòng lỗi vẫn được lưu ở Silver với `DataQualityStatus = Error` để tra cứu.

## 5.2. Chuẩn bị project đúng loại

1. Xem source hiện có ở [thư mục Sales](../repositories/rmit-fm-dataverse-plugins/src/Rmit.Fm.Dataverse.Plugins/Sales). `CreateSalesGoldPlugin.cs` hiện là **shim phục vụ test**, không triển khai `Microsoft.Xrm.Sdk.IPlugin`.
2. Tạo project plugin mới trong khu vực Dataverse plugins bằng `pac plugin init` theo help của bản PAC đang dùng, hoặc theo [tutorial plugin chính thức](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/tutorial-write-plug-in). Thực hiện trong thư mục mới, tránh ghi đè project hiện tại.
3. Chọn framework được Dataverse sandbox hỗ trợ. Theo tài liệu Microsoft đã đối chiếu, .NET Framework 4.6.2–4.8 được hỗ trợ; **4.8 được khuyến nghị**. .NET 10 dùng cho Azure Functions ở bài sau, không dùng cho assembly plugin này. [Supported customizations](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/supported-customizations).
4. Project cần reference `Microsoft.Xrm.Sdk` từ gói SDK phù hợp và strong-name signing. Giữ khóa ký ngoài Git. Dùng scaffold/dependent assembly packaging chính thức nếu có dependency bổ sung.
5. Không reference thẳng DLL `net8.0` hiện có từ project .NET Framework. `DateOnly` và một số kiểu trong core hiện tại cần được chuyển thành DTO tương thích, hoặc tách thư viện dùng chung rồi build/test đúng target.
6. Tái sử dụng công thức trong `SalesGoldCalculator.cs` và `SalesCategoryRules.cs`; kiểm tra lại test khi chuyển target. Bài này mô tả cách nối SDK vào dữ liệu thật, không coi shim hiện tại là adapter đã hoàn thành.

## 5.3. Plugin validation: đọc từng đoạn

Mẫu sau là một class `IPlugin` cho project mới. Nó nhận Target, ghép giá trị với PreImage khi Update, rồi kiểm tra **chỉ những dòng đang được đánh dấu Valid**.

```csharp
using System;
using Microsoft.Xrm.Sdk;

public sealed class ValidateSalesSilverPlugin : IPlugin
{
    public void Execute(IServiceProvider provider)
    {
        // [1] Context mô tả sự kiện; trace giúp tìm lỗi trên server.
        var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
        var trace = (ITracingService)provider.GetService(typeof(ITracingService));
        if (context.PrimaryEntityName != "sdp_salessilver" ||
            (context.MessageName != "Create" && context.MessageName != "Update")) return;
        if (!context.InputParameters.Contains("Target") ||
            !(context.InputParameters["Target"] is Entity)) return;

        var target = (Entity)context.InputParameters["Target"];
        var before = context.PreEntityImages.Contains("Before")
            ? context.PreEntityImages["Before"] : new Entity("sdp_salessilver");

        // [2] Update chỉ gửi các cột được sửa. Giá trị còn lại lấy từ PreImage.
        var effective = new Entity("sdp_salessilver");
        foreach (var item in before.Attributes) effective[item.Key] = item.Value;
        foreach (var item in target.Attributes) effective[item.Key] = item.Value;

        // [3] Cho phép lưu dòng lỗi để Dataflow giữ lại bằng chứng ở Silver.
        if (effective.GetAttributeValue<string>("sdp_dataqualitystatus") != "Valid") return;

        trace.Trace("ValidateSilver start; CorrelationId={0}; Message={1}",
            context.CorrelationId, context.MessageName);

        decimal quantity = RequiredDecimal(effective, "sdp_quantity");
        decimal price = RequiredDecimal(effective, "sdp_unitprice");
        decimal discount = RequiredDecimal(effective, "sdp_discountpct");
        if (quantity <= 0m || price < 0m || discount < 0m || discount > 1m)
        {
            // [4] Throw chặn thao tác hiện tại, không âm thầm sửa dữ liệu đầu vào.
            trace.Trace("ValidateSilver rejected; CorrelationId={0}", context.CorrelationId);
            throw new InvalidPluginExecutionException(
                "Không thể đánh dấu Valid: Qty phải > 0, Price >= 0, Discount từ 0 đến 1. " +
                "CorrelationId=" + context.CorrelationId);
        }
        trace.Trace("ValidateSilver passed; CorrelationId={0}", context.CorrelationId);
    }

    private static decimal RequiredDecimal(Entity row, string column)
    {
        if (!row.Contains(column) || row[column] == null)
            throw new InvalidPluginExecutionException("Thiếu giá trị số: " + column);
        return row.GetAttributeValue<decimal>(column);
    }
}
```

Mẫu này chỉ bảo vệ ba quy tắc số để học plugin. Dataflow/API còn phải kiểm tra ngày, OrderId trùng/thiếu, master customer/product, currency và quan hệ batch. Không suy ra toàn bộ Silver hợp lệ chỉ vì plugin validation này không báo lỗi.

### Đăng ký plugin theo đúng bảng

1. Build project Release; kiểm tra build không lỗi.
2. Mở **Plug-in Registration Tool**, đăng nhập đúng environment thực hành.
3. **Register new assembly**, chọn DLL mới, Isolation **Sandbox**, storage **Database**.
4. Register step thứ nhất: Message **Create**, Primary Entity `sdp_salessilver`, Stage **PreOperation**, Mode **Synchronous**.
5. Register step thứ hai: Message **Update**, cùng entity/stage/mode.
6. Update step → Filtering Attributes: `sdp_quantity,sdp_unitprice,sdp_discountpct,sdp_dataqualitystatus`.
7. Update step → thêm **Pre Image**, name và alias **Before**, columns gồm đúng bốn cột trên. Create không có PreImage.
8. Thêm assembly và các step vào **Sales Data Platform Demo** qua solution. Việc đăng ký bằng PRT không tự bảo đảm mọi component đã nằm trong solution đích.
9. Bật trace như bài 1 và thử bảng test bên dưới.

Trong PreOperation, thay đổi Target có thể được Dataverse lưu cùng request; không gọi `service.Update(Target)` trong chính event Update vì có thể tạo vòng lặp. Mẫu trên chỉ validate nên không cần Update.

| Thử lưu Silver | Kết quả |
| --- | --- |
| Qty `2`, Price `1000`, Discount `0.05`, Quality `Valid` | Lưu thành công, trace Passed |
| Qty `-1`, Quality `Valid` | Bị từ chối, có trace Rejected |
| Qty `-1`, Quality `Error`, có DataQualityMessage | Lưu được để phục vụ điều tra |
| Dòng Valid: chỉ sửa Discount thành `1.2` | Vẫn bị chặn; chứng minh PreImage/Filtering Attributes hoạt động |

## 5.4. Nối logic tính Gold với schema thật

### Hợp đồng API đề xuất cho bài học

| Thuộc tính | Giá trị |
| --- | --- |
| Unique name | `sdp_CalculateSalesGold` |
| Binding Type | Global / unbound |
| Is Function | **No** — đây là Action có ghi dữ liệu |
| Enabled for Workflow | **Yes**, để Power Automate gọi |
| Is Private | No trong bài học để dễ discover; đây không phải thiết lập bảo mật |
| Plugin Type | Class thực tế `CalculateSalesGoldPlugin` sau khi register |
| Input | `SilverRecordId` String, `BatchId` String, `RunId` String; required trong contract bài học |
| Output | `SalesGoldId` String, `IsUpdate` Boolean, `ErrorMessage` String |

`BatchId` là GUID dòng PipelineBatch; `RunId` ở hợp đồng này mang giá trị `sdp_runkey`. Contract là đề xuất mới, cần đồng bộ với caller và shim cũ có `Reprocess`; không trộn hai phiên bản tham số. Các kiểu String ở đây được chọn cho bài học, plugin phải parse/kiểm tra GUID trước khi dùng.

### Luồng code của CalculateSalesGoldPlugin

1. Lấy `IPluginExecutionContext`, `ITracingService`, `IOrganizationServiceFactory`; tạo service theo `context.UserId` để giữ quyền của identity đang thực thi.
2. Kiểm tra đủ input, `SilverRecordId` và `BatchId` parse được GUID.
3. `service.Retrieve` PipelineBatch bằng BatchId và Silver bằng SilverRecordId, dùng ColumnSet chỉ chứa các cột cần thiết.
4. So sánh BatchKey của Silver và Batch; so sánh RunId với RunKey hiện hành. Chỉ cho chạy trong trạng thái **Calculating** của lần xử lý đó. Dòng thuộc batch khác phải bị từ chối.
5. Kiểm tra `sdp_dataqualitystatus == "Valid"`; đọc lại Qty/Price/Discount/ngày/currency, không chỉ tin nhãn Valid.
6. Lấy ProductCode, tìm cost từ cấu hình **sdp_DemoMasterDataJson** đã nạp từ fixture. Đọc current value của environment variable, fallback default khi không có current value; thiếu/không hợp lệ thì báo lỗi. Không để client truyền một giá vốn tùy ý và không mặc định cost bằng 0.
7. Tính bằng **decimal** theo công thức bên dưới, với cùng quy tắc làm tròn trong `SalesGoldCalculator.cs`.
8. Tạo Entity Gold, key `sdp_recordkey` lấy từ Silver; copy BatchKey và các trường mô tả, ghi chỉ số, đặt **ReportStatus = Candidate**.
9. Upsert bằng alternate key đã Active. Cùng row gọi lại thì cập nhật cùng Gold, không Add new row mỗi lần.
10. Ghi trace bắt đầu/kết thúc gồm BatchKey, RunId, RecordKey, CorrelationId; trả SalesGoldId/IsUpdate. Lỗi thì ném exception có thông báo gọn để flow Catch lưu PipelineError.

Không copy nguyên `CreateSalesGold.cs` đang tìm Gold theo `SourceSystem + OrderId`: schema tenant hiện chưa có SourceSystem/DataSourceId. Adapter của bài học dùng **BatchKey + RecordKey lineage**. Tránh giả lập một GUID DataSource để vừa DTO cũ.

### Công thức và mapping

```text
GrossSales     = Round(Qty × UnitPrice, 4)
DiscountAmount = Round(GrossSales × DiscountPct, 4)
NetSales       = Round(GrossSales − DiscountAmount, 4)
Cost           = Round(Qty × CostPerUnit, 4)
GrossProfit    = Round(NetSales − Cost, 4)
GrossMarginPct = NetSales = 0 ? 0 : Round(GrossProfit / NetSales, 6)
```

Midpoint rounding: **AwayFromZero** như core hiện tại. Margin lưu dạng tỷ lệ: `0.263158` hiển thị khoảng `26.3158%`. Cột `sdp_grossmarginpct` trong snapshot mới có precision 4 nên phải thực hiện bước đổi precision 6 ở phần chuẩn bị để giữ đủ số lẻ; nếu giữ nguyên, giá trị lưu bị làm tròn thành khoảng `0.2632`. Category theo ngưỡng demo trong `plan.md`: NetSales ≥ 2000 là High, ≥ 1000 là Medium, còn lại Low.

| Gold | Nguồn |
| --- | --- |
| `sdp_name`, `sdp_recordkey`, `sdp_batchkey` | Name/RecordKey/BatchKey từ Silver |
| `sdp_orderid`, `sdp_orderdate` | OrderId/OrderDate từ Silver |
| `sdp_year`, `sdp_month` | Năm/tháng theo ngày đơn hàng; không lấy ngày chạy flow |
| `sdp_customercode`, `sdp_customername` | Customer đã kiểm tra tại Silver |
| `sdp_productcode`, `sdp_productname`, `sdp_currency` | Product/currency từ Silver |
| `sdp_grosssales`, `sdp_discountamount`, `sdp_netsales` | Kết quả công thức |
| `sdp_cost`, `sdp_grossprofit`, `sdp_grossmarginpct` | Kết quả công thức |
| `sdp_salescategory`, `sdp_reportstatus` | Category demo, `Candidate` |

Đoạn SDK cốt lõi cho bước upsert, đặt **bên trong** class API sau khi đã tạo Entity `gold`, kiểm tra dữ liệu và có `service`:

```csharp
// Gold phải có đầy đủ các cột bắt buộc trước đoạn này.
// recordKey là key của dòng Silver vừa xác minh, ví dụ demo01-r0001.
gold.KeyAttributes["sdp_recordkey"] = recordKey;
var response = (Microsoft.Xrm.Sdk.Messages.UpsertResponse)service.Execute(
    new Microsoft.Xrm.Sdk.Messages.UpsertRequest { Target = gold });

context.OutputParameters["SalesGoldId"] = response.Target.Id.ToString();
context.OutputParameters["IsUpdate"] = !response.RecordCreated;
context.OutputParameters["ErrorMessage"] = string.Empty;
```

Đây là đoạn minh họa SDK, chưa phải toàn bộ class CalculateSalesGoldPlugin. Các bước 1–10 ở trên là checklist implementation của class đó. [Microsoft: Upsert](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-upsert-insert-update-record).

## 5.5. Tạo Custom API và gọi thử

1. Register assembly chứa class API bằng PRT, cùng quy trình Sandbox như trên.
2. Trong solution → **New → More → Other → Custom API**, nhập các thuộc tính ở bảng contract.
3. Tạo ba **Custom API Request Parameter**: SilverRecordId, BatchId, RunId; gắn đúng API và loại String.
4. Tạo ba **Custom API Response Property**: SalesGoldId/String, IsUpdate/Boolean, ErrorMessage/String.
5. Gắn **Plugin Type** của API vào class đã register. Không đăng ký thêm một step Stage 30 thủ công cho API: linkage Plugin Type xử lý main operation.
6. Kiểm tra component API/parameter/response/assembly có trong solution. [Microsoft: tạo Custom API](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/create-custom-api-maker-portal).
7. Tạo instant flow trong solution, tên `TEST_CalculateOneGold`, trigger **Manually trigger a flow**, nhận BatchId và SilverRecordId.
8. Action Dataverse **Get a row by ID** lấy batch; action **Perform an unbound action** chọn `sdp_CalculateSalesGold`; map hai GUID và `RunId = sdp_runkey` của batch.
9. Với batch thực hành chưa có worker đang chạy, đặt Status `Calculating`; tạo dòng Silver mẫu ở bảng dưới rồi chạy test flow.
10. Thử lại cùng input: Gold vẫn chỉ có một dòng. Sau đó thử input batch khác/Quality Error/thiếu product cost và kiểm tra lỗi rõ ràng.

### Dòng Silver mẫu để nhập tay

| Cột | Giá trị |
| --- | --- |
| Name / BatchKey / RecordKey | `SO001`, `demo01`, `demo01-r0001` |
| Order ID / Order Date | `SO001`, 01/08/2026 |
| Customer Code / Customer Name | `C001`, `ABC Ltd` |
| Product Code / Product Name | `P001`, `Laptop` |
| Quantity / Unit Price / Discount Percent | `2`, `1000`, `0.05` |
| Currency / Data Quality Status | `USD`, `Valid` |

Master fixture cho P001 có cost/unit **700**. Kết quả: **NetSales 1900, Cost 1400, Profit 500, Margin 0.263158**, Category Medium. Gold còn Candidate cho đến khi bài 8 đối soát batch.

Sau bài thử một dòng, chờ test flow/API kết thúc rồi đưa batch thử về `New`; giữ Gold Candidate làm bằng chứng và không bấm Gửi xử lý trên batch đó. Bài CSV đầy đủ dùng batch mới, ví dụ `demo02`. Không để batch thử nằm ở `Calculating`, vì Intake bài 8 sẽ hiểu rằng vẫn còn một batch đang xử lý. Đây là thao tác kết thúc bài thử thủ công, không phải cơ chế retry tự động.

## 5.6. Nếu có lỗi thì tìm thế nào?

| Hiện tượng | Kiểm tra |
| --- | --- |
| Flow không thấy tên API | Is Function = No, Enabled for Workflow = Yes; cập nhật metadata action/caller |
| API trả giá trị mặc định nhưng không tạo Gold | Plugin Type có gắn đúng class không? Có thể mới tạo contract chưa có logic |
| Update Quantity âm không bị chặn | Filtering Attributes, PreImage alias Before, Quality có đúng Valid không? |
| Gold bị trùng | Alternate key chưa Active hoặc code đang Create thay vì Upsert |
| Nhận exception nhưng PipelineError trống | Flow Catch phải ghi lỗi ngoài transaction plugin |
| Build core thành công nhưng register DLL lỗi | Kiểm tra framework, IPlugin, signing, dependencies; không dùng shim net8.0 như assembly sandbox |

**Bài đã đạt khi:** validation chạy phía server, một Silver tạo đúng một Gold, chạy lặp không nhân đôi và lỗi có CorrelationId tra được. Chưa coi đây là kiểm thử concurrent/multi-batch hoặc production readiness.
