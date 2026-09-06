# Bài 1–4: nhìn thấy lỗi, thông báo trên form, nút bấm và custom page

[Về lộ trình](demo-learning-guide.vi.md). Làm phần chuẩn bị app trong lộ trình trước. Các đoạn code dưới đây là mẫu để bạn tạo web resource khi thực hành; chưa được upload hoặc kiểm thử trong app thật.

## Bài 1 — Debugger, error và log

**Mục tiêu:** khi gặp lỗi, biết đúng nơi để xem thay vì chỉ thấy “Failed”.

| Lỗi xảy ra ở đâu? | Mở ở đâu? | Nhìn gì? |
| --- | --- | --- |
| Form, JavaScript, Xrm | Trình duyệt → F12 → Console / Sources / Network | Dòng code, lỗi JS, request thất bại |
| Plugin C# | Plugin Trace Log | CorrelationId, tên plugin, bước xử lý và lỗi |
| Power Automate | Flow → Run history → lần chạy → action đỏ | Inputs/Outputs, trạng thái, lỗi connector |
| Azure Function | Local: terminal/F5; Azure: Application Insights | Operation ID, request, exception và thời gian |
| Dữ liệu bị từ chối | App → Pipeline Errors | BatchKey, RunKey trong key lỗi, dòng nguồn, Layer, ErrorType |

### Bước 1.1: xem lỗi JavaScript

1. Mở **Sales Demo** ở tab trình duyệt riêng, mở form Batch.
2. Nhấn **F12 → Console**. Để cửa sổ này mở trong khi làm bài 2.
3. Sau khi thêm JS ở bài 2, vào **Sources**, tìm web resource theo tên `sales-demo-form.js`, đặt breakpoint trong `onSourceUrlChange`.
4. Sửa Source URL rồi bấm sang ô khác. Trình duyệt dừng tại breakpoint.
5. Xem `value` trong Scope/Watch, bấm Step over để đi từng dòng và Resume để chạy tiếp. Nếu chưa load JS, kiểm tra form library và bản publish trước.

Console chỉ phục vụ debug trên máy bạn; refresh trang có thể mất nội dung. Lỗi cần tra cứu lâu dài phải có log server hoặc PipelineError.

### Bước 1.2: chuẩn bị trace cho plugin

1. Khi bắt đầu bài 5, mở thiết lập **Plug-in Trace Log** của environment thực hành. Tùy giao diện, có thể dùng System Settings → Customization → Enable logging to plug-in trace log, hoặc thiết lập trace trong Plug-in Registration Tool.
2. Chọn **All** trong lúc học để thấy cả chạy thành công và thất bại. Sau khi debug xong, đổi về mức phù hợp; All sinh nhiều log.
3. Tài khoản xem log phải có quyền đọc PluginTraceLog. Bật trace không tự cấp quyền xem.
4. Gọi plugin một lần đúng và một lần sai. Tìm tên class và `CorrelationId` từ thông báo lỗi.
5. Nếu cần breakpoint C# phía server, dùng **Plug-in Profiler**: cài profiler bằng PRT trong dev → Start profiling step → tái hiện lỗi → lấy profile → replay/debug trong Visual Studio. Dừng profiling sau bài tập.

F5 tại VS Code không tự gắn debugger vào sandbox Dataverse trên cloud. PRT là công cụ riêng; bản PAC cài bằng .NET Tool hiện tại không bảo đảm có `pac tool prt`. Dùng [bộ công cụ Microsoft](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/download-tools-nuget) và [hướng dẫn debug plugin](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/tutorial-debug-plug-in).

### Bước 1.3: một bộ định danh đi xuyên suốt

Trong mọi flow, giữ `BatchKey = demo01`, `RunKey = run01`; mỗi row thêm `RecordKey = demo01-r0001`. Plugin ghi thêm `context.CorrelationId`. Function trả `correlationId`. Ghi các ID này vào thông báo lỗi đã được làm gọn để tìm qua nhiều công cụ.

**Chú ý transaction:** plugin tạo PipelineError rồi ném exception trong cùng transaction có thể làm bản ghi lỗi bị rollback. Plugin ghi `ITracingService`; action gọi plugin thất bại thì **flow Catch tạo PipelineError ở request riêng**. PluginTraceLog vẫn có thể tồn tại sau rollback. [Microsoft: trace và rollback](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/logging-tracing).

**Bài đã đạt khi:** bạn tìm được action/dòng code gây lỗi bằng cùng BatchKey/CorrelationId, không chỉ nhìn thấy nhãn Failed.

## Bài 2 — Field notification khi sửa URL

**Mục tiêu:** nhập link sai thì lỗi nằm ngay cạnh Source URL; nhập đúng thì gỡ lỗi. Thông báo “đã thay đổi” chỉ nhắc chưa lưu, không gửi email.

### Bước 2.1: tạo JavaScript web resource

Trong solution: **New → More → Web resource**, Type **JavaScript**, tên ví dụ `sdp_/scripts/sales-demo-form.js`. Prefix `sdp` đã thuộc publisher của demo. Dán mẫu sau; đây là cùng library dùng cho nút ở bài 3.

```javascript
window.SalesDemo = window.SalesDemo || {};

// [1] Kiểm tra trên form để người dùng sửa sớm.
// Backend ở bài 8 vẫn phải kiểm tra URL độc lập.
SalesDemo.validateUrl = function (formContext) {
    const field = formContext.getAttribute("sdp_sourceurl");
    const control = formContext.getControl("sdp_sourceurl");
    if (!field || !control) return false;

    const value = (field.getValue() || "").trim();
    const notificationId = "sales-source-url";
    control.clearNotification(notificationId); // Xóa đúng thông báo của bài này.

    try {
        const url = new URL(value);
        // [2] So sánh hostname chính xác; không dùng includes("drive.google.com").
        const match = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
        const fileId = match ? match[1] : null;
        if (url.protocol !== "https:" || url.hostname !== "drive.google.com" ||
            url.username || url.password || url.port || !fileId) {
            throw new Error("Unsupported Drive file URL");
        }
        return true;
    } catch {
        // [3] setNotification là lỗi validation: nó có thể chặn Save.
        control.setNotification(
            "Nhập link file: https://drive.google.com/file/d/<file-id>/view",
            notificationId
        );
        return false;
    }
};

SalesDemo.onLoad = function (executionContext) {
    // [4] Form event nhận executionContext, từ đó mới lấy formContext.
    const form = executionContext.getFormContext();
    if (form.getAttribute("sdp_sourceurl")?.getValue()) SalesDemo.validateUrl(form);
};

SalesDemo.onSourceUrlChange = function (executionContext) {
    const form = executionContext.getFormContext();
    const valid = SalesDemo.validateUrl(form);
    form.ui.clearFormNotification("sales-unsaved");
    if (valid) {
        // [5] Thông báo INFO không chặn lưu.
        form.ui.setFormNotification(
            "URL đã thay đổi. Hãy lưu trước khi gửi xử lý.", "INFO", "sales-unsaved"
        );
    }
};

SalesDemo.openBatchConsole = async function (primaryControl, pageName) {
    // [6] Command truyền PrimaryControl: đây đã là formContext.
    const form = primaryControl;
    const id = (form.data.entity.getId() || "").replace(/[{}]/g, "");
    if (!id || form.data.entity.getIsDirty()) {
        await Xrm.Navigation.openAlertDialog({ text: "Hãy lưu batch trước khi mở trang theo dõi." });
        return;
    }
    if (!pageName) {
        await Xrm.Navigation.openAlertDialog({ text: "Chưa cấu hình logical name của custom page." });
        return;
    }
    try {
        // [7] Truyền GUID bản ghi; không truyền BatchKey như demo01 vào recordId.
        await Xrm.Navigation.navigateTo({
            pageType: "custom", name: pageName,
            entityName: "sdp_pipelinebatch", recordId: id
        }, {
            target: 2, position: 1,
            width: { value: 80, unit: "%" }, title: "Theo dõi batch"
        });
        // [8] Với dialog, promise hoàn thành khi đóng trang.
        await form.data.refresh(false);
        form.ui.clearFormNotification("sales-unsaved");
    } catch (error) {
        console.error("SalesDemo.openBatchConsole", error);
        await Xrm.Navigation.openAlertDialog({ text: "Không mở được trang. Kiểm tra tên page và Console." });
    }
};
```

Mẫu cố ý hỗ trợ một dạng link `/file/d/.../view` để bài đầu dễ kiểm thử. Link thư mục hoặc `open?id=...` cần bổ sung parser và test trước khi hỗ trợ. Kiểm tra hợp lệ về hình thức chưa chứng minh tài khoản Drive có quyền đọc file.

### Bước 2.2: gắn đúng event

1. Save/Publish web resource.
2. Mở Main form Pipeline Batch → thêm library vừa tạo vào **Form libraries**.
3. Form **On Load** → hàm `SalesDemo.onLoad` → bật **Pass execution context as first parameter**.
4. Chọn cột Source URL → **On Change** → `SalesDemo.onSourceUrlChange` → cũng bật **Pass execution context**.
5. Save/Publish form, mở lại app rồi thử sửa URL.

`OnChange` thường chạy khi giá trị đã đổi và bạn rời ô, không phải mỗi phím gõ. Nó cũng không tự thông báo khi người khác/flow sửa dữ liệu trên server; trường hợp đó cần refresh và audit. Nếu JS gọi `setValue`, muốn chạy handler thì cần `fireOnChange` riêng. [Control notification](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference/controls/setnotification), [OnChange](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference/events/attribute-onchange).

| Thử | Kết quả mong đợi |
| --- | --- |
| `https://example.com/a.csv` | Lỗi cạnh ô URL |
| `https://drive.google.com.attacker.example/file/d/abc/view` | Bị từ chối |
| Link file Drive thật theo đúng mẫu | Gỡ lỗi đỏ; hiện INFO chưa lưu |
| Xóa URL rồi rời ô | Báo cần nhập URL |
| Đổi file khi batch đã Completed | Bài học yêu cầu tạo batch mới; không dùng lại dữ liệu Gold cũ |

## Bài 3 — Thêm command button

**Mục tiêu:** trên form batch có nút **Theo dõi batch**. Tạo custom page theo bài 4 trước khi test mở trang.

1. Mở app **Sales Demo → Edit**.
2. Chọn trang bảng **SDP Pipeline Batch → … → Edit command bar**.
3. Chọn **Main form**. Bài này không dùng Main grid vì tham số dòng được chọn sẽ khác.
4. **New command**, Label `Theo dõi batch`, chọn icon phù hợp.
5. Action **Run JavaScript**, library `sdp_/scripts/sales-demo-form.js`, Function `SalesDemo.openBatchConsole`.
6. Thêm tham số đầu **PrimaryControl**.
7. Thêm tham số thứ hai kiểu **String**, giá trị là **Name/logical name thật** của custom page ở bài 4. Không dùng display name “Batch Console”.
8. Save/Publish command và app. Mở form của một batch đã lưu rồi bấm nút.

Nếu vị trí thêm tham số khác giữa các bản designer, chọn phần parameters của JavaScript action. Giữ đúng thứ tự `(PrimaryControl, pageName)`. Không truyền executionContext của form event vào nút này.

**Bài đã đạt khi:** bấm trên batch A thì trang hiển thị A; đóng trang và bấm batch B thì hiển thị B. [Microsoft: command designer](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/use-command-designer).

## Bài 4 — Custom page nhận đúng batch

### Bước 4.1: dựng trang nhỏ

1. Trong app designer → **Add page → Custom → Create new**, tên hiển thị `Batch Console`.
2. Trong page designer, thêm Dataverse data sources **SDP Pipeline Batches** và **SDP Pipeline Errors**. Chúng là bảng đã có, không tạo bản sao.
3. Thêm Label tên batch, Label trạng thái, ba Label Bronze/Silver/Gold Count, Gallery lỗi, nút **Làm mới**, nút **Gửi xử lý**, nút **Đóng**.
4. Dùng các display name dưới đây nếu IntelliSense nhận đúng. Nếu tên hiển thị khác do ngôn ngữ/app, chọn lại trường từ IntelliSense và đối chiếu logical name ở lộ trình. Công thức dùng dấu phân cách kiểu en-US; Studio ở locale khác có thể dùng `;` và `;;`.

### Bước 4.2: đọc tham số trên Screen.OnVisible

```powerfx
// Lấy đúng GUID được Xrm truyền tới; thiếu/sai GUID thì dừng ở trạng thái lỗi.
Set(varBatchId, IfError(GUID(Param("recordId")), Blank()));
Set(varSubmitting, false);
Refresh('SDP Pipeline Batches');
Set(
    varBatch,
    LookUp('SDP Pipeline Batches', 'SDP Pipeline Batch' = varBatchId)
);
If(IsBlank(varBatch), Notify("Không tìm thấy batch hoặc bạn chưa có quyền đọc.", NotificationType.Error))
```

Dùng OnVisible để đọc lại khi trang được mở; không dựa duy nhất vào App.OnStart vốn chỉ chạy một lần trong một session. Không fallback `First(Batches)` khi thiếu recordId vì có thể mở nhầm batch. Luôn test mở A → đóng → mở B. [Xrm và record context](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/navigate-to-custom-page-examples).

Thiết lập từng control:

| Control/property | Công thức |
| --- | --- |
| Label tên → Text | `varBatch.Name` |
| Label trạng thái → Text | `varBatch.Status` |
| Label Bronze → Text | `"Bronze: " & Text(Coalesce(varBatch.'Bronze Count', 0))` |
| Label Silver / Gold | Tương tự với `'Silver Count'` và `'Gold Count'` |
| Gallery lỗi → Items | `Filter('SDP Pipeline Errors', 'Batch Key' = varBatch.'Batch Key')` |
| Label trong Gallery | `ThisItem.Layer & ": " & ThisItem.'Error Message'` |
| Nút Đóng → OnSelect | `Back()` |

Nút **Làm mới → OnSelect**:

```powerfx
Refresh('SDP Pipeline Batches');
Refresh('SDP Pipeline Errors');
Set(varBatch, LookUp('SDP Pipeline Batches', 'SDP Pipeline Batch' = varBatchId))
```

### Bước 4.3: nút Gửi xử lý

Đến bài 8 mới có flow nhận sự kiện. Bài này chỉ ghi yêu cầu, chưa khẳng định xử lý thành công.

**DisplayMode**:

```powerfx
If(IsBlank(varBatch) || varBatch.Status <> "New" || varSubmitting,
   DisplayMode.Disabled, DisplayMode.Edit)
```

**OnSelect**:

```powerfx
Set(varSubmitting, true);
IfError(
    Set(varBatch, Patch('SDP Pipeline Batches', varBatch, {Status: "Requested"})),
    Notify("Chưa gửi được yêu cầu. Hãy làm mới và thử lại.", NotificationType.Error),
    Notify("Đã gửi yêu cầu. Bấm Làm mới để xem tiến trình.", NotificationType.Success)
);
Set(varSubmitting, false)
```

Nút chỉ gửi batch `New`. Retry sẽ làm có kiểm soát ở bài 8 sau khi đọc lỗi. Nút disabled giúp UX, không thay thế kiểm tra trạng thái/quyền ở backend; hai tab vẫn có thể gửi yêu cầu đồng thời.

### Bước 4.4: publish đủ các phần

1. Save/Publish custom page.
2. Quay về solution, lấy **Name** của page, điền tham số String cho command ở bài 3.
3. Bảo đảm page nằm trong app; Save/Publish app và command.
4. Mở lại app, thử hai batch khác nhau. Bản Preview trong designer có thể không có `recordId`; hãy test bằng command trong model-driven app.
5. Sau khi triển khai bài, [chạy status và export snapshot](pac-connection-status.vi.md). Publish page, publish app và ghi một batch là ba thao tác khác nhau.

**Kết quả cuối bài:** có một form báo lỗi rõ ràng, một nút mở custom page và một trang hiển thị đúng trạng thái/lỗi của batch được chọn.
