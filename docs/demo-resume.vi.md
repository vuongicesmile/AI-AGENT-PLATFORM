# Tiếp tục Sales Demo sau khi reset usage

Checkpoint: **06/09/2026**. Người dùng chủ động tạm dừng vì gần hết usage, yêu cầu commit/push toàn bộ công việc. Không có yêu cầu hủy thiết kế hoặc xóa tài nguyên.

## 1. Đọc theo thứ tự này

1. [Requirement gốc](requirment.md): 8 nội dung học Power Platform.
2. [Overview bài toán](demo-business-overview.vi.md): cách dữ liệu đi từ nguồn đến Đồng/Bạc/Vàng.
3. [Learning guide](demo-learning-guide.vi.md): thiết kế demo đã thống nhất.
4. [Nhật ký implementation](demo-implementation-journal.vi.md): việc đã thực hiện thật.
5. Tài liệu này: trạng thái dừng và thứ tự làm tiếp.

Ưu tiên demo Sales đơn giản, giải thích từng bước bằng tiếng Việt. Không chuyển sang triển khai toàn bộ hệ thống FM/RMIT trong `AGENTS.md`; những quy tắc bảo mật, kiểm thử và bảo toàn thay đổi của repo vẫn áp dụng.

## 2. Trạng thái thật lúc dừng

| Thành phần | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| PAC / Dataverse / Azure CLI | Đã đăng nhập | Environment Developer đã chọn; connection private giữ local |
| Model-driven app Sales Demo | **Đã publish** | Build hoàn tất, verify 95/95; chưa kiểm thử bằng trình duyệt |
| 5 bảng, 5 forms, 5 views, menu | Đã có trên Dataverse | 5 bảng Organization-owned; không có phân quyền theo owner từng dòng |
| Form JavaScript + command button | Đã deploy | Đã gắn events; chưa có kiểm thử UI thực tế |
| Custom page + Xrm navigation | Code gọi trang đã viết | Trang và biến tên trang chưa tạo, nút chưa hoạt động end-to-end |
| Plugin + Custom API tính Gold | Code local | Chưa đăng ký assembly, steps, PreImages hoặc Custom API |
| HTTP CSV parser | Code local, 17 test đạt | Chưa chạy Functions host hoặc Azure |
| Timer + Service Bus sender | Code local | Chưa có namespace/queue, chưa gửi message thật |
| Custom connector / Dataflow / Power Automate | Chưa deploy | Đã discovery FlowAgent, connection Dataverse còn hoạt động |
| End-to-end CSV → Bronze → Silver → Gold | **Chưa chạy thật** | Không đánh dấu hoàn tất từ unit test hoặc app verify |

## 3. File cần tiếp tục sửa

- App spec: `repositories/rmit-fm-power-platform/src/sales-demo/app-spec.json`.
- Snapshot solution đã export/unpack: `repositories/rmit-fm-power-platform/solutions/SalesDataPlatformDemo/` (cấu hình thật trên Dataverse lúc checkpoint).
- Form JS: `repositories/rmit-fm-power-platform/src/sales-demo/webresources/sales-demo-form.js`.
- Plugin: `repositories/rmit-fm-dataverse-plugins/src/SalesDemo.Plugin/`.
- Plugin tests: `repositories/rmit-fm-dataverse-plugins/tests/SalesDemo.Plugin.Tests/`.
- Functions: `repositories/rmit-fm-integrations/src/SalesDemo.Functions/`.
- Parser tests: `repositories/rmit-fm-integrations/tests/SalesDemo.Functions.Tests/`.
- Scripts: `scripts/prepare_sales_demo.ps1`, `scripts/power_platform_status.py`, `scripts/flow_agent.py`, `scripts/sales_dataverse.py`.

`sales_dataverse.py` hiện chỉ có CLI `inspect`. Patch `deploy` đang soạn đã bị ngắt, **chưa áp dụng**. Không chạy `deploy` trước khi thực sự viết và kiểm tra lệnh này.

## 4. Các bước tiếp theo

1. **Đọc trạng thái trước khi ghi.** Kiểm tra Git/PAC và app `sdp_salesdemo`; tải spec hiện tại bằng skill app-builder nếu sửa app. Không tạo lại app/bảng hoặc chạy teardown. Người dùng đã chọn environment/solution Developer và yêu cầu làm giúp; không hỏi lại những lựa chọn đã có.
2. **Hoàn thiện và kiểm thử plugin.** Thêm test cho Batch validation mới; giữ kiểm tra RecordKey thuộc batch. Bổ sung script đăng ký idempotent với SDK/auth chính thức.
3. **Chuẩn bị metadata cho plugin.** Tạo alternate key BatchKey trên Batch, RecordKey trên Bronze/Silver/Gold/Error; đợi index Active. Tăng precision `sdp_grossmarginpct` từ 4 lên 6. Tạo biến master-data JSON và ngưỡng category theo fixture đã thống nhất, không tự đặt KPI mới.
4. **Đăng ký plugin.** Assembly signed/Sandbox; Silver và Batch: Create/Update, PreOperation synchronous, Update có filtering attributes và PreImage `Before`. Custom API `sdp_CalculateSalesGold`: unbound Action, WorkflowSdkStepEnabled=true, PluginTypeId trỏ class tính Gold; không thêm Stage 30 step riêng.
5. **Kiểm thử thật một dòng.** Dùng batch/dòng synthetic riêng, gọi Custom API với `SilverRecordId`, `BatchId`, `RunId` (String). Dòng SO001 kỳ vọng NetSales=1900, Cost=1400, GrossProfit=500, GrossMarginPct=0.263158. Gọi lại phải cùng Gold ID, không tăng số dòng; kiểm tra sai RunId bị từ chối.
6. **Dựng flow test bằng connection có sẵn.** Dùng FlowAgent, đọc template và `get_operation_details` trước khi viết action; validate, tạo Stopped, preflight rồi mới bật/test. Giữ component trong solution. Không gửi email/Teams thực tế trong bài test.
7. **Nối custom page thật.** Chưa có Canvas Authoring session hoặc app ID cho custom page. Tạo/mở custom page qua luồng Microsoft hỗ trợ, connect và `sync_canvas` trước khi sửa YAML. Không thay bằng generative page mà vẫn gọi đó là custom page.
8. **Giải quyết hạ tầng Azure.** Tài khoản chỉ có tenant-level account, chưa có subscription truy cập được. Cần người dùng kích hoạt subscription hoặc cấp quyền trên subscription có sẵn trước khi tạo tài nguyên có chi phí. Không xem Power Platform license là Azure subscription.
9. **Nối phần còn lại.** Function HTTP → custom connector → intake flow → Bronze → Dataflow Silver → Custom API Gold → đối soát → Completed/Ready. Google Drive và Service Bus connections chưa có; cần OAuth/hạ tầng thật.
10. **Kiểm thử cả luồng và lỗi.** Invalid CSV, duplicate OrderId, stale RunId/callback, retry không trùng, lỗi connector/plugin, watchdog; kiểm tra tổng 10 dòng theo fixture, chỉ phát hành Gold khi đối soát đạt. Export/unpack solution sau thay đổi, cập nhật nhật ký và trạng thái từng requirement.

## 5. Kết nối, công cụ và dữ liệu local không đưa lên Git

Trên máy hiện tại, repo ở `D:\Coder\AI-AGENT-PLATFORM`:

- `.dataverse/connection.json`: environment URL/ID, solution ID/name và PAC profile đã chọn.
- `.dataverse/flow-environments.json`, `flow-connections.json`, `flow-tools.json`, `flow-templates.json`: kết quả discovery FlowAgent.
- `.dataverse/metadata.xml`, `plugin-metadata.json`: metadata thực tế, đã xác minh navigation properties cho đăng ký plugin/API.
- `.dataverse/keys/SalesDemo.Plugin.snk`: khóa ký local; **giữ lại để cập nhật assembly với cùng identity**. Chỉ tạo khóa mới trên máy mới khi đã xem xét identity cần giữ.
- `.tools/azure-cli`: venv chứa Azure CLI 2.90.0, PowerPlatform-Dataverse-Client 1.0.0, azure-identity và pandas.
- `.maker-workspace` trong thư mục app: cache SDK, build status/log và app ID thực tế. Build cuối kết thúc `2026-09-06T06:38:55Z`, verify pass.
- PAC: `%USERPROFILE%\.dotnet\tools\pac.exe`; Node 24, Python 3.14, .NET SDK 10 đã có. Azure Functions Core Tools chưa cài.

Các file trên không nằm trong Git. Trên máy mới phải thiết lập công cụ và đăng nhập lại; không copy token cache vào repo. Các helper FlowAgent/model-apps gọi Azure CLI nên cần thêm `.tools/azure-cli/Scripts` vào PATH trong tiến trình.

## 6. Kiểm tra local

```powershell
# Tạo khóa nếu chưa có; script giữ nguyên khóa đã tồn tại.
powershell -ExecutionPolicy Bypass -File scripts\prepare_sales_demo.ps1
dotnet test repositories\rmit-fm-dataverse-plugins\tests\SalesDemo.Plugin.Tests\SalesDemo.Plugin.Tests.csproj --configuration Release
dotnet test repositories\rmit-fm-integrations\tests\SalesDemo.Functions.Tests\SalesDemo.Functions.Tests.csproj --configuration Release
node --check repositories\rmit-fm-power-platform\src\sales-demo\webresources\sales-demo-form.js
```

Kết quả checkpoint: xem phần xác nhận cuối ở nhật ký. Unit test plugin dùng mock SDK; chưa chứng minh Dataverse đã thực thi plugin. Parser tests chưa chứng minh deployment Azure hoặc HTTP host thực tế.

## 7. Câu nhắc để tiếp tục

> Đọc `docs/demo-resume.vi.md` và `docs/demo-implementation-journal.vi.md`, kiểm tra repo và environment hiện tại, tiếp tục từ phần đăng ký/kiểm thử plugin đang dở. Làm từng bước và giải thích bằng tiếng Việt; chỉ ghi hoàn tất khi có bằng chứng thật.
