# Kế hoạch triển khai Dev

## 1. Các bước

| Bước | Nội dung | Evidence đầu ra |
|---|---|---|
| D0 | ADR, source inventory, access matrix, Dev/Test skeleton | Quyết định và unknowns được ghi nhận |
| D1 | Canonical schema và seed dimensions | Migration/solution import, uniqueness/RBAC tests |
| D2 | Mock adapter và ingestion contract | Fixture BACnet/Modbus/Archibus, idempotency tests |
| D3 | Dataverse Bronze landing và run control | Replay, watermark, retry, quarantine evidence |
| D4 | Silver quality pipeline | Unit normalization, dedup/gap/outlier/range tests |
| D5 | Dataverse Gold aggregate và target | Reconciliation hourly/daily/monthly |
| D6 | Semantic model và dashboard pilot | RLS, freshness và render-time evidence |
| D7 | Workflow, checklist, manual capture | Approval, email, audit, QR/typed-ID tests |
| D8 | Historical migration rehearsal | Profile, mapping, dry-run, rollback |
| D9 | Hardening/UAT/release candidate | UAT sign-off, docs, monitoring, RAID update |

## 2. Cách làm ingestion đầu tiên

1. Dùng fixture/mock thay cho source thật nếu interface chưa được xác nhận.
2. Tạo `fm_ingestion_run`.
3. Validate common envelope và map meter/asset.
4. Tính `record_hash`.
5. Append bảng Bronze Dataverse và upsert `fm_utility_reading`.
6. Ghi accepted/rejected count, watermark, retry và latency.
7. Chạy lại cùng fixture để chứng minh không sinh duplicate.

## 3. Gate trước khi chuyển bước

- Schema và security tests pass.
- Ingestion replay/idempotency pass.
- Bronze/Silver/Gold reconciliation không có critical issue.
- RLS, workflow, email, checklist, QR và typed-ID tests pass.
- Historical migration dry-run và rollback được chấp nhận.
- UAT, performance và freshness có evidence tái lập được.

## 4. Chưa được tự quyết

Không tự chọn production hosting, interface chưa xác nhận của BMS/PME/Archibus, KPI formula, approval matrix, retention, RPO/RTO hoặc SLA latency. Các nội dung này phải thành ADR/decision trước khi triển khai irreversible.
