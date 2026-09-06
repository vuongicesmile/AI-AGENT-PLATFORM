# Nhật ký thiết kế demo và giải thích từng quyết định

Ngày: 06/09/2026. Nhật ký này ghi **những việc đã thực hiện trong repo** khi thiết kế các bài học. Các thao tác Save/Publish/Register/Deploy trong bài thực hành là hướng dẫn cho bước triển khai sau, chưa phải thao tác đã chạy trên tenant.

## Bước 1 — Đọc yêu cầu của bạn

Đã đọc nguyên file `docs/requirment.md`: debugger/log, field notification, command button, Xrm/custom page, plugin, Azure Function/schedule, connector, Service Bus/Automate.

**Cách hiểu:** bạn muốn học các phần đó bằng demo Sales đang có. Vì vậy mình gắn mỗi yêu cầu vào một tình huống nhìn thấy được: sửa URL, mở batch, tính một Gold row, đọc một CSV, phát hiện một batch chậm. “Field notification” được hiểu là thông báo trên form khi người dùng sửa ô; không tự biến nó thành gửi email mỗi lần bảng thay đổi.

**Kết quả:** lập bảng ánh xạ đủ 8 yêu cầu trong [lộ trình](demo-learning-guide.vi.md).

## Bước 2 — Đối chiếu với dữ liệu thật đã kiểm tra

Đã đọc báo cáo PAC và snapshot export ngày 06/09. Không lấy tên bảng từ trí nhớ hoặc tạo schema tưởng tượng.

| Phát hiện | Ý nghĩa đối với bài học |
| --- | --- |
| Có 5 bảng, chưa có app/flow/plugin trong solution | Bắt đầu bằng dựng model-driven app trên bảng có sẵn |
| Status, DataQualityStatus, ReportStatus là Text | Ví dụ dùng chuỗi, không dùng `OptionSetValue` hoặc mã Choice tự đặt |
| Bảng đang nối bằng BatchKey text, chưa có lookup | Custom page lọc theo BatchKey; subgrid quan hệ chưa tự hoạt động |
| BatchKey/RunKey/RecordKey/Name có trường bắt buộc | Mapping của flow phải ghi đủ; không chỉ ghi ErrorMessage rồi cho rằng đã lưu được lỗi |
| Chưa thấy alternate key trong snapshot | Thêm bước tạo key và chờ Active trước khi dạy upsert/idempotency |
| Các số tiền là Decimal | Mẫu plugin đọc decimal; không cast thành Money |
| GrossMarginPct precision 4, code tính 6 | Ghi rõ đề xuất nâng precision trước khi so kết quả lưu với C# |

**Giải thích:** một ví dụ chung có thể đúng về ý tưởng nhưng không chạy trên bảng của bạn. Đối chiếu kiểu dữ liệu và tên cột giúp tránh lỗi “đúng code nhưng sai schema”.

## Bước 3 — Đọc code hiện tại và xác định phần tái sử dụng

Đã đọc `CreateSalesGoldPlugin.cs`, `CreateSalesGold.cs`, DTO/data-access interface và `SalesGoldCalculator.cs`, cùng CSV/master fixture.

**Phát hiện:** shim C# hiện tại phục vụ test, chưa phải `IPlugin` được register. Core `net8.0` sử dụng DateOnly và model có SourceSystem/DataSourceId khác schema tenant hiện tại.

**Quyết định:** giữ công thức đã có làm nguồn đối chiếu; hướng dẫn tạo adapter/plugin đúng framework và map BatchKey/RecordKey của tenant. Không gọi việc copy DLL cũ là deploy plugin thành công.

**Kết quả:** bài 5 tách rõ validation plugin, Custom API contract, SDK upsert, registration và một test flow gọi một dòng Silver trước.

## Bước 4 — Kiểm tra cách dùng API chính thức

Đã tra Microsoft Learn cho Xrm navigateTo, form notifications, command designer, plugin trace/profiler, Custom API, Azure Functions isolated, Timer, custom connectors, Dataflows và Service Bus.

| Chi tiết đã kiểm tra | Cách áp dụng |
| --- | --- |
| Form event và command có context khác nhau | OnChange nhận executionContext; command nhận PrimaryControl |
| Custom page cần logical name và recordId là GUID | Không truyền display name hoặc BatchKey `demo01` làm recordId |
| setNotification có thể chặn Save | Chỉ dùng cho lỗi nhập liệu; thông báo thay đổi dùng INFO |
| Plugin throw có thể rollback bản ghi lỗi cùng transaction | Trace trong plugin; flow Catch ghi PipelineError ở request riêng |
| Refresh Dataflow không nhận arbitrary RunId | Lưu dấu mốc trên batch và kiểm tra callback trước khi chạy Gold |
| PAC/API status không thay runtime test | Giữ riêng “query pass”, “publish”, “deploy”, “batch Completed” |
| Service Bus có thể giao lại message | Complete sau khi lưu cảnh báo; có key chống trùng ở Dataverse |

Link Microsoft nằm cạnh phần hướng dẫn tương ứng để bạn đọc sâu hơn khi thực hành.

## Bước 5 — Chọn vai trò của từng thành phần

**Form** giúp nhập đúng. **Custom page** giúp nhìn tiến trình. **Automate** nối các bước. **Function HTTP** đọc CSV. **Dataflow** chuẩn hóa Silver. **Plugin** tính Gold. **Timer + Service Bus + Automate** phát hiện batch chậm.

Mình chọn queue cho watchdog vì bạn có thể thử rất rõ: dừng flow nhận → message nằm trong queue → bật flow → message được xử lý. Đưa ngay cả file pipeline qua queue sẽ thêm việc lock, delivery, retry và correlation trong lúc bạn còn học form/plugin.

Đây là thứ tự học, không phải loại bỏ Service Bus khỏi khả năng xử lý batch trong tương lai. Khi cần nhiều worker hoặc throughput cao, có thể thiết kế queue cho xử lý file dựa trên kế hoạch đầy đủ.

## Bước 6 — Viết bài thực hành

Đã tạo các tài liệu:

| File | Nội dung |
| --- | --- |
| [demo-learning-guide.vi.md](demo-learning-guide.vi.md) | Bản đồ 8 yêu cầu, sơ đồ, chuẩn bị, trạng thái và key |
| [demo-lab-01-ui.vi.md](demo-lab-01-ui.vi.md) | Bài 1–4, mẫu JS có chú thích, command, Power Fx/custom page |
| [demo-lab-02-plugin.vi.md](demo-lab-02-plugin.vi.md) | Bài 5, IPlugin mẫu, contract API, mapping, đăng ký và test một dòng |
| [demo-lab-03-azure.vi.md](demo-lab-03-azure.vi.md) | Bài 6–7, HTTP contract, parser mẫu, timer, connector và test |
| [demo-lab-04-automation.vi.md](demo-lab-04-automation.vi.md) | Bài 8, action-by-action intake, Dataflow, callback, queue và lỗi |
| [demo-learning-flow.md](demo-learning-flow.md) | Sơ đồ Mermaid dạng raw để chỉnh bằng trình dựng Mermaid |

Mỗi bài có đầu vào, thao tác, giải thích và bằng chứng pass. Các snippet chưa đầy đủ class/project đều được ghi rõ là minh họa; không gắn nhãn deployable cho blueprint.

## Bước 7 — Rà soát trước khi giao

Đã đối chiếu đủ 8 yêu cầu, schema/precision trong ví dụ và mapping các trường bắt buộc. Khi rà soát, bổ sung kiểm tra miền giá trị tại Silver để Qty âm vẫn được giữ dưới trạng thái Error; bổ sung cách kết thúc batch thử một dòng để không chặn Intake của bài CSV.

Kết quả kiểm tra local ngày 06/09/2026:

| Kiểm tra | Kết quả và phạm vi |
| --- | --- |
| 7 tài liệu tiếng Việt và sơ đồ | Đọc UTF-8 thành công, không có ký tự thay thế lỗi, khoảng trắng cuối dòng hoặc thiếu newline cuối file |
| 31 liên kết nội bộ | Đích file/thư mục và các heading được dẫn tới đều tồn tại |
| 18 khối code | Đóng/mở code fence đầy đủ |
| 3 mẫu JSON | Parse thành công bằng Python json |
| 1 mẫu JavaScript web resource | Tách nguyên mẫu từ bài UI và chạy `node --check`: exit code 0 |
| Hai nguồn Mermaid | Nội dung trong lộ trình và file sơ đồ raw giống nhau; chưa chạy trình render Mermaid |
| Lần chạy kiểm tra cuối | Exit code 0, danh sách lỗi rỗng |

Script và báo cáo kiểm tra nằm trong thư mục local được Git ignore: `.dataverse/validate_learning_docs.py` và `.dataverse/learning-docs-validation.json`. Script chỉ đọc tài liệu, tạo file kiểm tra local và kiểm tra cú pháp; không gọi Power Platform. Không sửa nội dung `requirment.md`, không commit/push hay deploy trong bước thiết kế này.

Phần chưa thể kết luận từ tài liệu: publish thực tế của app/page, compile/register toàn bộ plugin adapter, quyền connector/Azure, callback Dataflow thật, chạy queue và kết quả end-to-end. C# minh họa chưa được build trong project triển khai; Power Fx và M chưa được kiểm tra trong designer/runtime thật. Những phần này phải có log/test khi triển khai; không đánh dấu pass từ việc viết xong hướng dẫn.

## Bạn nên đọc và làm thế nào?

**Bổ sung ngày 06/09 theo yêu cầu overview:** đã đối chiếu lại plan, tách tình huống minh họa khỏi requirement đã có, và viết [overview nghiệp vụ](demo-business-overview.vi.md) cùng sơ đồ raw. Nội dung giải thích vai trò người dùng, luồng tới Power BI, ba tầng dữ liệu và ứng dụng thực tế của cả 8 yêu cầu. Đã đối chiếu tài liệu Microsoft về custom page, Dataflow và Service Bus. Đây là bổ sung tài liệu local; chưa thực hiện triển khai. Các con số kiểm tra ở bước 7 phản ánh bộ tài liệu tại thời điểm kiểm tra trước phần bổ sung này.

1. Mở lộ trình, làm phần **Chuẩn bị** và tạo một batch `demo01`.
2. Làm bài 1–4 để nhìn thấy form/nút/custom page chạy được.
3. Làm bài 5 với **một Silver row**, so NetSales/Cost/Profit với số mẫu.
4. Làm parser và connector riêng, nhìn JSON trước khi ghép vào flow.
5. Ghép toàn bộ CSV 10 dòng, sau đó mới thêm watchdog queue.
6. Mỗi bước lỗi thì dừng tại bước đó, mở đúng loại log và giữ BatchKey/RunKey để tra cứu.

Không cần học hết dịch vụ trong một lượt. Mỗi bài pass là bạn đã có một chức năng nhỏ quan sát và giải thích được.
