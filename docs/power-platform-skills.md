# Bộ skill Power Platform đã cài

Ngày kiểm tra: 2026-09-05. Đã cài skill local cho Codex; chưa cấu hình hoặc kiểm thử kết nối tenant.

## Nguồn

Khảo sát qua [ExplainX](https://www.explainx.ai/skills), đối chiếu nội dung và phụ thuộc tại repository gốc.

- [Microsoft Dataverse Skills](https://github.com/microsoft/Dataverse-skills): cài nguyên plugin để giữ script và reference dùng chung. Commit marketplace: `001b31e0c78e63a0675078ad599e44c16078cd7f`.
- [Microsoft Power Platform Skills](https://github.com/microsoft/power-platform-skills): gói Power Automate và Power Apps. Commit marketplace: `5a325ffa030cdd0576586bcc1007b996d5d54d52`.
- [GitHub Awesome Copilot](https://github.com/github/awesome-copilot/tree/main/skills): 9 skill độc lập, cài bằng `skill-installer` từ nhánh `main` tại thời điểm cài.

## Các gói Microsoft

| Gói | Phiên bản | Số skill | Mục đích |
|---|---|---:|---|
| `dataverse` | 1.12.1 | 9 | Kết nối, schema, CRUD/import/upsert, truy vấn, security, admin và Solution ALM |
| `power-automate` | 3.0.5 | 10 | Tạo, sửa, kiểm tra, debug và quản lý flow |
| `canvas-apps` | 3.0.3 | 4 | Canvas App qua Canvas Authoring MCP, PA YAML |
| `model-apps` | 2.5.1 | 4 | Model-driven app, bảng, form, view và generative page; app-builder ở trạng thái preview |
| `code-apps-preview` | 1.1.0 | 15 | React/Vite Code App và data connector |

Dataverse gồm `dv-overview`, `dv-connect`, `dv-metadata`, `dv-data`, `dv-query`, `dv-solution`, `dv-security`, `dv-admin`, `erp-xpp`. `erp-xpp` đi kèm gói nhưng không cần cho Sales MVP.

## Các skill độc lập

| Skill | Dùng khi |
|---|---|
| `power-platform-architect` | Chuyển requirement thành kiến trúc Power Platform |
| `microsoft-docs` | Tra cứu tài liệu Microsoft hiện hành, gồm Power Query/Dataflow và Power Fx |
| `microsoft-code-reference` | Kiểm chứng API, SDK, chữ ký phương thức và code mẫu |
| `csharp-xunit` | Kiểm thử logic C#; phù hợp xUnit đã có trong repo |
| `power-bi-model-design-review` | Review schema, relationship, storage mode, RLS |
| `power-bi-dax-optimization` | Review và tối ưu DAX measure |
| `power-bi-report-design-consultation` | Thiết kế report, visual, bộ lọc và accessibility |
| `power-bi-performance-troubleshooting` | Chẩn đoán refresh, query và render performance |
| `power-platform-mcp-connector-suite` | Custom connector tích hợp MCP/Copilot Studio |

## Thứ tự dùng cho plan.md

1. `power-platform-architect` + `microsoft-docs`: đối chiếu requirement Sales và các quyết định còn thiếu.
2. `dv-solution` + `dv-metadata`: `SalesDataPlatform`, bảng, relationship, alternate key.
3. Gói `power-automate` + `dv-data`: Google Drive intake, validation và Bronze ingestion.
4. `microsoft-docs` + `microsoft-code-reference`: Power Query/Dataflow cho Silver.
5. `microsoft-code-reference` + `csharp-xunit`: Custom API/C# Plugin cho Gold và kiểm thử logic.
6. Bộ Power BI: semantic model, DAX, report và hiệu năng.
7. `dv-security` + `dv-solution`: phân quyền và ALM giữa Dev/Test/Prod.

Power Apps dùng khi cần giao diện nhập URL, xem PipelineRun/PipelineError hoặc quản lý cấu hình. Chọn Canvas, model-driven hay Code App theo UX thực tế.

## Trạng thái xác minh

- `codex plugin list --json` xác nhận 5 plugin đều `installed: true`, `enabled: true`.
- 42 file `SKILL.md` trong các plugin tồn tại, không rỗng.
- 9 skill độc lập có `SKILL.md` và metadata `name`/`description`.
- Máy có Node.js, .NET SDK `10.0.400` và `dnx`.
- Chưa tìm thấy `pac` hoặc `az` trong PATH tại thời điểm kiểm tra.
- Chưa đăng nhập tenant, cấu hình Dataverse MCP hay kiểm thử MCP runtime. Cài đặt thành công chưa chứng minh kết nối live hoạt động.
- Skill mới sẽ có ở lượt trao đổi tiếp theo. Nếu danh sách chưa cập nhật, mở phiên mới hoặc tải lại ứng dụng.

Skill độc lập nằm ở `C:\Users\Admin\.codex\skills`.

Plugin nằm dưới `C:\Users\Admin\.codex\plugins\cache\dataverse-skills` và `C:\Users\Admin\.codex\plugins\cache\power-platform-skills`.

## Bổ sung khi có nhu cầu

- `power-pages`: portal dạng Code Site/SPA; đã có trong marketplace, chưa cài plugin.
- `powerbi-modeling`: thao tác trực tiếp semantic model; cần Power BI Modeling MCP.
- `flowstudio-power-automate-*`: cần Flow Studio MCP và tài khoản/JWT; hiện đã chọn gói Power Automate của Microsoft.
- Mobile/native extension: chưa cần cho MVP.

Đối chiếu guideline skill với requirement và hướng dẫn project. Ví dụ trong skill không thay thế phê duyệt deployment, framework plugin, KPI, SLA hay licensing. C# vẫn là hướng triển khai custom plugin của project.
