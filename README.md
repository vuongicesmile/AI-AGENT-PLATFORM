# RMIT FM Delivery Workspace

This directory is a local workspace for the repositories that deliver the RMIT FM Data & Automation Platform. It is intentionally not a super-repository and does not use Git submodules.

## Repository map

| Repository | Deployable boundary |
|---|---|
| `rmit-fm-power-platform` | Dataverse schema, Power Apps, Power Automate, ALM metadata, architecture and traceability |
| `rmit-fm-dataverse-plugins` | Server-side Dataverse C# plug-ins and Custom API handlers |
| `rmit-fm-pcf-components` | Client-side Power Apps Component Framework controls |
| `rmit-fm-integrations` | External .NET integration workers and source adapters |
| `rmit-fm-analytics` | Power BI PBIP semantic models, reports and themes |

The canonical project instructions remain in [`AGENTS.md`](AGENTS.md) and apply to every repository in this workspace.

The original scaffold does not configure credentials or production deployment.

## Sales Demo — checkpoint 06/09/2026

App **Sales Demo** đã publish trong environment Developer; phần plugin, Azure và pipeline end-to-end còn đang triển khai.

- [Đọc từ đây để tiếp tục sau khi reset usage](docs/demo-resume.vi.md).
- [Nhật ký: đã làm gì, kiểm tra gì, còn thiếu gì](docs/demo-implementation-journal.vi.md).
- [Overview bài toán và luồng đầu cuối](docs/demo-business-overview.vi.md).
- [Hướng dẫn thực hành theo 8 yêu cầu](docs/demo-learning-guide.vi.md).

Kết nối và khóa ký được giữ local trong các đường dẫn gitignore; không chứa trong GitHub.
