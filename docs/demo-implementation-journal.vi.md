# Nhật ký implementation Sales Demo

Ngày bắt đầu: 06/09/2026. Tài liệu này ghi việc thực hiện thật; thiết kế tham khảo nằm trong `demo-learning-guide.vi.md`.

## Bước 0 — Kiểm tra môi trường

- Đã chạy lại `scripts/power_platform_status.py`: 8 kiểm tra hoàn tất, PAC kết nối đúng environment đã được người dùng chỉ định.
- Solution `SalesDataPlatformDemo` hiện chứa 5 bảng; truy vấn trong solution chưa thấy model-driven app hoặc flow.
- Máy có .NET SDK 10.0.400; Azure Functions Core Tools chưa được cài.
- Đã cài Azure CLI 2.90.0 trong `.tools/azure-cli`, đăng nhập thành công bằng device code. Tài khoản chỉ có tenant-level account, chưa thấy Azure subscription có thể truy cập; chưa tạo tài nguyên Azure.
- Core C# hiện có target net8.0 và shim phục vụ test. Sẽ tạo adapter IPlugin riêng theo schema sdp, giữ code cũ để đối chiếu.

## Các bước đang thực hiện

1. JavaScript form: validation, notification, log và command mở đúng batch.
2. Plugin Dataverse: validation Silver và Custom API tính Gold, có kiểm thử SDK.
3. Azure Functions: parser HTTP, timer và Service Bus, có kiểm thử dữ liệu đầu vào.
4. App, connector, Dataflow và flow: nối các thành phần sau khi xác minh quyền/kết nối thật.
5. Kiểm thử trên environment, export snapshot và ghi bằng chứng. Chỉ đánh dấu hoàn tất khi có kết quả thật.

Danh sách trên là tiến trình công việc, không phải tất cả đã hoàn tất.

## Checkpoint 06/09/2026 — dừng theo yêu cầu để chờ reset usage

**Điểm bắt đầu lần sau:** đọc [Hướng dẫn tiếp tục](demo-resume.vi.md). Người dùng yêu cầu lưu toàn bộ thay đổi lên GitHub và tạm dừng implementation.

### Đã thực hiện trên Power Platform

- Xác minh environment được chọn là **Developer**, solution unmanaged `SalesDataPlatformDemo`, publisher prefix `sdp`.
- Build và publish model-driven app **Sales Demo**, unique name `sdp_salesdemo` bằng công cụ Microsoft `build-model-app.js`.
- Kết quả cuối: **0 lỗi**, `verify PASS (95/95 present)`. Đây là kiểm tra cấu hình/thành phần, chưa phải kiểm thử người dùng hoặc pipeline end-to-end.
- Tái sử dụng 5 bảng; tạo 5 views, 5 forms, menu vận hành/ba tầng, web resource JavaScript và command “Theo dõi batch”.
- Bổ sung các cột: `sdp_startedon` (DateTime), `sdp_silverrequestedon` (DateTime), `sdp_silverrunkey` (Text) trên `sdp_pipelinebatch`.
- Form Batch được gắn OnLoad và OnChange Source URL. Code tự tạo BatchKey/RunKey cho dòng mới, kiểm tra link Drive và thông báo thay đổi chưa lưu.
- Bản build đầu dừng tại role vì bảng là **Organization-owned**, không hỗ trợ scope `user`. Đã bỏ persona khỏi spec và chạy lại thành công; không cấp role mới cho người khác. Chưa triển khai quyền theo từng người sở hữu dòng.
- Có connection Dataverse `shared_commondataserviceforapps` đang Connected. Connection Dataverse cũ báo lỗi đăng nhập; chưa sửa/xóa connection này.
- Chưa tạo flow, custom page, environment variables, alternate keys, plugin assembly hoặc Custom API. Đã kiểm tra assembly `SalesDemo.Plugin`: chưa có trên môi trường.

### Đã viết code local

- `SalesDemo.Plugin` target .NET Framework 4.8, ký strong name bằng khóa local được gitignore.
- `CalculateSalesGoldPlugin`: kiểm tra BatchId/RunId, trạng thái Calculating, Silver Valid, số lượng/giá/discount, master customer/product, OrderId trùng; tính doanh thu/chi phí/lợi nhuận và upsert Gold Candidate.
- `ValidateSalesSilverPlugin`: kiểm tra giá trị số ở PreOperation; Update hợp nhất Target với PreImage Before.
- Thay đổi cuối: kiểm tra RecordKey thuộc BatchKey và thêm `ValidatePipelineBatchPlugin` để bảo vệ BatchKey, URL/RunKey khi đang xử lý, URL Google Drive khi Requested. Batch plugin chưa có kiểm thử riêng và chưa đăng ký step.
- `SalesDemo.Functions`: HTTP parser CSV, giới hạn dung lượng/10 dòng, UTF-8, quoted CSV, SHA-256; Timer có chế độ LogOnly và sender Service Bus qua DefaultAzureCredential.
- Kiểm thử đã chạy trước checkpoint: 17 test parser đạt. Plugin có 14 test đạt trước thay đổi cuối; kết quả kiểm tra lại được ghi trong hướng dẫn tiếp tục.
- JavaScript có notification, log và `Xrm.Navigation.navigateTo` custom page theo environment variable; **nút chưa mở được trang** vì trang và biến `sdp_BatchConsolePageName` chưa được tạo.
- Script `flow_agent.py` gọi bundle MCP FlowAgent chính thức, đã đọc environments/connections/templates. `sales_dataverse.py` đã đọc metadata bằng SDK/auth helper Microsoft; CLI hiện chỉ hỗ trợ `inspect`.

### Phần bị ngắt và chưa được thực hiện

- Bản patch bổ sung lệnh `deploy` cho `sales_dataverse.py` bị người dùng ngắt và **không được ghi vào file**. Không được giả định đã có script đăng ký plugin hoàn chỉnh.
- Chưa chạy Function host HTTP thực tế, chưa deploy Azure Function/Service Bus, chưa tạo custom connector, Dataflow hoặc cloud flow.
- Chưa kiểm thử UI trong trình duyệt, chưa có Canvas Authoring session, chưa kiểm thử dữ liệu chạy thật từ Đồng đến Vàng.
- Kết nối private, inventory, metadata, log build và khóa ký tiếp tục nằm local; không đưa lên GitHub.

### Xác nhận trước khi commit checkpoint

- Chạy lại plugin tests sau thay đổi cuối: **15 passed, 0 failed**, đồng thời build được Batch plugin mới. Batch plugin chưa có test hành vi riêng.
- Parser tests đã đạt **17 passed** trong phiên implementation, không thay đổi source sau lần chạy đó.
- Kiểm tra JavaScript syntax bằng `node --check`; các script Python được kiểm tra AST không ghi bytecode (máy chặn tạo thư mục `scripts/__pycache__`).
- Đã nhận đầy đủ kết quả build app cuối: publish thành công và verify 95/95. Không còn tiến trình build app chạy nền.
- Đã export unmanaged solution và unpack thành source tại `repositories/rmit-fm-power-platform/solutions/SalesDataPlatformDemo/`. Snapshot chứa bảng, form/view, web resources, app module và sitemap do Dataverse sinh; không phải solution XML viết tay.
