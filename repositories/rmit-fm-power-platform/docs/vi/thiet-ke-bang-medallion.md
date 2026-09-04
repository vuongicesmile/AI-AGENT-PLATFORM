# Thiết kế bảng Medallion

Xem [Kiến trúc Dataverse Medallion cho Data Engineering](kien-truc-dataverse-medallion.md) để hiểu Solution layout, processing flow và các design gates phải hoàn tất trước khi chốt physical Tables.

## 1. Quy ước chung

Tất cả Bronze/Silver/Gold đều là bảng Dataverse trong phase này. Dùng logical name có publisher prefix; display name nên có tiền tố `FM Bronze`, `FM Silver`, `FM Gold`. Các bảng cần giữ các cột lineage sau:

`source_system`, `source_record_key`, `ingestion_run_id`, `source_timestamp`, `ingested_at_utc`, `record_hash`, `created_at_utc`, `updated_at_utc`.

Thời gian chuẩn là UTC, đồng thời giữ timezone/offset gốc nếu source cung cấp. Bronze không được hard delete.

## 2. Bảng Operational/Data Central

| Bảng | Ý nghĩa | Khóa/cột chính |
|---|---|---|
| `fm_location` | Campus/building/area | `location_id`, `location_type`, `parent_location_id`, `code` |
| `fm_asset` | Equipment cần quản lý | `asset_id`, `asset_code`, `location_id`, `asset_type`, `qr_code` |
| `fm_meter` | Water/power/PQM meter hoặc feeder | `meter_id`, `meter_code`, `metric_code`, `protocol`, `unit` |
| `fm_utility_reading` | Một operational reading hợp lệ | `reading_id`, `meter_id`, `source_timestamp`, `value_decimal`, `unit`, `source` |
| `fm_source_system` | Cấu hình source/adapter | `source_system_id`, `code`, `vendor`, `timezone`, `enabled` |
| `fm_ingestion_run` | Một lần chạy adapter | `ingestion_run_id`, `started_at_utc`, `watermark_from/to`, `status`, counts |
| `fm_data_quality_issue` | Một lỗi hoặc cảnh báo dữ liệu | `issue_id`, `layer`, `rule_code`, `record_hash`, `severity`, `status` |
| `fm_checklist_template` | Định nghĩa checklist | `template_id`, `asset_type`, `version`, `status` |
| `fm_checklist_item` | Một câu hỏi/field/rule | `item_id`, `template_id`, `sequence`, `required`, min/max, `unit` |
| `fm_checklist_submission` | Một lần submit checklist | `submission_id`, `template_id`, `asset_id`, `submitted_by`, `status` |
| `fm_checklist_value` | Một giá trị trả lời | `value_id`, `submission_id`, `item_id`, value, `is_out_of_range` |
| `fm_workflow_request` | CIWG/risk/project request | `request_id`, `workflow_type`, `status`, `owner_id`, `due_at_utc` |
| `fm_workflow_step` | Một approval step | `step_id`, `request_id`, `sequence`, approver, `status` |
| `fm_workflow_event` | Audit event bất biến | `event_id`, `request_id`, actor, event time, comments |

## 3. Bronze — sau ingestion

Bronze là bảng Dataverse append-only, giữ dữ liệu theo hình dạng source và envelope metadata.

| Bảng | Grain | Quy tắc |
|---|---|---|
| `bronze.utility_reading_raw` | Một source reading/metric | Giữ raw value/unit/timestamp/payload và adapter version |
| `bronze.checklist_submission_raw` | Một form submission | Giữ toàn bộ giá trị và actor metadata |
| `bronze.archibus_extract_raw` | Một row trong file/export | Giữ file name, row number và extract timestamp |
| `bronze.ingestion_run_raw` | Một lần chạy adapter | Giữ watermark, counts, status và errors |

`record_hash` được tính ổn định từ source identity + timestamp + metric + value + unit. Dataverse dùng alternate key dạng text `external_key` để Upsert; không phụ thuộc vào GUID do Dataverse sinh.

## 4. Silver — làm sạch và kiểm tra

| Bảng | Grain | Kiểm tra chính |
|---|---|---|
| `silver.dim_location` | Một location chuẩn | Hierarchy và active dates |
| `silver.dim_asset` | Một asset chuẩn | QR và fallback code không trùng |
| `silver.dim_meter` | Một meter chuẩn | Source mapping, metric/unit compatibility |
| `silver.utility_reading` | Một reading normalized | Dedup, unit, range, gap, outlier |
| `silver.checklist_result` | Một checklist answer | Required, range, unit |
| `silver.workflow_event` | Một workflow event | Actor, timestamp, status transition |
| `silver.data_quality_issue` | Một issue theo rule/record | Severity, owner, resolution status |

`quality_state` gồm `VALID`, `SUSPECT`, `REJECTED`. Record bị reject vẫn phải truy vấn được trong quarantine/quality issue; không được xóa im lặng.

## 5. Gold — phục vụ báo cáo

| Bảng | Grain | Nội dung |
|---|---|---|
| `gold.utility_hourly` | meter × metric × hour | Consumption, count, completeness, baseline, target |
| `gold.utility_daily` | meter × metric × day | Total/average/min/max và variance |
| `gold.utility_monthly` | meter × metric × month | Monthly total và trend |
| `gold.power_quality_hourly` | feeder/meter × hour | Voltage, THD, threshold breach |
| `gold.checklist_trend` | asset/item × period | Statistics, out-of-range, completion |
| `gold.fm_kpi_snapshot` | KPI × scope × period | Value, numerator, denominator, target, status |
| `gold.workflow_sla` | request/step | Cycle time, overdue, escalation |

Gold nên có `as_of_utc`, `data_freshness_minutes` và `source_row_count` để dashboard phân biệt giá trị 0 với dữ liệu stale/incomplete.
