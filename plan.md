# Sales Data Pipeline — Google Drive → Dataverse → Silver → Gold

## 1. Objective

Build a Power Platform data pipeline that:

1. Receives a Google Drive file URL.
2. Validates the URL and Google Drive file metadata.
3. Loads raw source rows into Dataverse Bronze.
4. Cleans and standardizes data into Dataverse Silver.
5. Uses Dataverse Custom API + Plugin for configurable mapping and business calculations.
6. Writes reporting-ready Gold data to Dataverse.
7. Exposes Gold data to Power BI.
8. Provides pipeline run and error auditability.

## 2. Reference architecture

Google Drive
    ↓
Power Automate — Intake & Validation
    ↓
Dataverse — DataSource / PipelineRun
    ↓
Dataverse — Sales_Bronze
    ↓
Power Query / Dataflow — Transformation
    ↓
Dataverse — Sales_Silver
    ↓
Power Automate — Call Custom API
    ↓
Dataverse Custom API + C# Plugin
    ↓
Dataverse — Sales_Gold
    ↓
Power BI

## 3. MVP scope

Start with one CSV format:

`Sales_YYYY_MM.csv`

Sample file:

`data/sample_sales_2026_08.csv`

MVP volume: 10 rows.

Target flow:

Google Drive URL → validation → Bronze → Silver → Gold.

Do not optimize for high-volume ingestion until the end-to-end MVP is working.

## 4. Dataverse tables

### 4.1 DataSource

Purpose: file-level ingestion tracking.

Columns:

- DataSourceId — GUID
- FileName — Text
- FileUrl — URL/Text
- GoogleDriveFileId — Text
- FolderPath — Text
- FileType — Choice/Text
- FileSize — Whole Number
- LastModified — DateTime
- FileHash — Text
- Status — Choice: New / Validated / Loaded / Rejected / Failed / Completed
- ErrorMessage — Multiline Text
- CreatedOn — DateTime
- ProcessedOn — DateTime

### 4.2 PipelineRun

Purpose: execution-level audit.

Columns:

- RunId — GUID
- DataSourceId — Lookup(DataSource)
- PipelineName — Text
- StartTime — DateTime
- EndTime — DateTime
- BronzeCount — Whole Number
- SilverCount — Whole Number
- GoldCount — Whole Number
- SuccessCount — Whole Number
- ErrorCount — Whole Number
- Status — Choice
- ErrorMessage — Multiline Text

### 4.3 PipelineError

Purpose: row-level error tracking.

Columns:

- ErrorId — GUID
- RunId — Lookup(PipelineRun)
- DataSourceId — Lookup(DataSource)
- Layer — Choice: Intake / Bronze / Silver / Gold
- RecordId — Text
- ErrorType — Text
- ErrorMessage — Multiline Text
- RawValue — Multiline Text
- CreatedOn — DateTime

### 4.4 Sales_Bronze

Purpose: preserve source data with minimal transformation.

Columns:

- SalesBronzeId — GUID
- DataSourceId — Lookup
- RowNumber — Whole Number
- OrderId — Text
- OrderDateRaw — Text
- CustomerRaw — Text
- ProductRaw — Text
- QtyRaw — Text
- UnitPriceRaw — Text
- DiscountRaw — Text
- CurrencyRaw — Text
- RawJson — Multiline Text
- LoadStatus — Choice: Loaded / Error
- LoadError — Multiline Text
- CreatedOn — DateTime

Bronze should remain close to the source so that bad transformations can be traced back to raw input.

### 4.5 Sales_Silver

Purpose: cleaned, typed, standardized business data.

Columns:

- SalesSilverId — GUID
- DataSourceId — Lookup
- OrderId — Text
- OrderDate — Date
- CustomerCode — Text
- CustomerName — Text
- ProductCode — Text
- ProductName — Text
- Quantity — Decimal
- UnitPrice — Decimal
- DiscountPct — Decimal
- Currency — Text
- GrossAmount — Currency/Decimal
- DiscountAmount — Currency/Decimal
- NetAmount — Currency/Decimal
- DataQualityStatus — Choice: Valid / Warning / Error
- DataQualityMessage — Multiline Text
- CreatedOn — DateTime

### 4.6 Sales_Gold

Purpose: reporting-ready data.

Columns:

- SalesGoldId — GUID
- DataSourceId — Lookup
- OrderId — Text
- OrderDate — Date
- Year — Whole Number
- Month — Whole Number
- CustomerCode — Text
- CustomerName — Text
- ProductCode — Text
- ProductName — Text
- Currency — Text
- GrossSales — Currency/Decimal
- DiscountAmount — Currency/Decimal
- NetSales — Currency/Decimal
- Cost — Currency/Decimal
- GrossProfit — Currency/Decimal
- GrossMarginPct — Decimal
- SalesCategory — Choice/Text
- ReportStatus — Choice
- CreatedOn — DateTime
- ProcessedOn — DateTime

### 4.7 DataMapping

Purpose: configurable source-to-target mapping.

Columns:

- MappingId — GUID
- SourceSystem — Text
- SourceColumn — Text
- TargetTable — Text
- TargetColumn — Text
- DataType — Text
- TransformationRule — Text
- IsActive — Yes/No
- Priority — Whole Number

Example rules:

| SourceColumn | TargetColumn | Rule |
|---|---|---|
| Order ID | OrderId | TRIM |
| Date | OrderDate | DATE_DDMMYYYY |
| Customer | CustomerName | TRIM |
| Qty | Quantity | DECIMAL |
| Unit Price | UnitPrice | DECIMAL |
| Discount | DiscountPct | PERCENT |
| Currency | Currency | UPPER |

## 5. Power Automate — PA_Sales_File_Intake

### Trigger

Create a DataSource row, or use a trigger when a DataSource row is created/updated.

### Step 1 — Validate URL

Check that FileUrl contains:

`drive.google.com`

If invalid:

- Status = Rejected
- ErrorMessage = Invalid Google Drive URL
- Create PipelineError
- Stop flow

### Step 2 — Extract Google Drive File ID

For URL format:

`https://drive.google.com/file/d/<FILE_ID>/view`

Expression:

```text
split(
    split(
        triggerOutputs()?['body/fileurl'],
        '/d/'
    )[1],
    '/'
)[0]
```

Store result in `GoogleDriveFileId`.

### Step 3 — Get file metadata

Use Google Drive connector to retrieve metadata by file ID.

Validate:

- file exists
- extension = `.csv`
- file name starts with `Sales_`
- file size is below configured maximum
- file is not empty

### Step 4 — Download file content

Use Google Drive `Get file content using id`.

### Step 5 — Create PipelineRun

Set:

- PipelineName = Sales Pipeline
- StartTime = utcNow()
- Status = Running

### Step 6 — Parse CSV

For MVP, parse CSV in Power Automate.

For production/high volume, move CSV parsing to Dataflow/Fabric/Azure-based processing rather than creating one Power Automate action per row.

### Step 7 — Insert Bronze

For each source row:

- preserve raw strings
- add DataSourceId
- add RowNumber
- set LoadStatus = Loaded

### Step 8 — Duplicate protection

Use a deterministic business/source key.

Recommended MVP key:

`DataSourceId + OrderId`

Do not blindly create duplicate Bronze rows when the same pipeline run is retried.

### Step 9 — Update DataSource

If Bronze load succeeds:

- Status = Loaded
- ProcessedOn = utcNow()

If errors occur:

- Status = Failed
- ErrorMessage = summarized error
- create PipelineError

## 6. Silver transformation

Use Power Query/Dataflow.

Source:

`Sales_Bronze`

### Transformation sequence

1. Filter only rows belonging to the current DataSource/Run.
2. Trim text columns.
3. Standardize casing where appropriate.
4. Convert OrderDateRaw to Date.
5. Convert QtyRaw to Decimal.
6. Convert UnitPriceRaw to Decimal.
7. Convert DiscountRaw to decimal percentage.
8. Normalize Currency.
9. Validate required fields.
10. Detect duplicate OrderId within the source.
11. Calculate GrossAmount.
12. Calculate DiscountAmount.
13. Calculate NetAmount.
14. Write valid/invalid records to Silver with DataQualityStatus.

### Calculations

```text
GrossAmount = Quantity * UnitPrice

DiscountAmount = GrossAmount * DiscountPct

NetAmount = GrossAmount - DiscountAmount
```

Example:

```text
Quantity = 2
UnitPrice = 1000
DiscountPct = 0.05

GrossAmount = 2000
DiscountAmount = 100
NetAmount = 1900
```

## 7. Silver data quality rules

Required:

- OrderId is not null
- OrderDate is valid
- Quantity > 0
- UnitPrice >= 0
- DiscountPct between 0 and 1
- Currency is supported
- CustomerCode/ProductCode can be resolved when required

Invalid rows should not silently disappear.

Set:

`DataQualityStatus = Error`

and create a PipelineError record.

## 8. Gold processing

### Custom API

Create:

`CalculateSalesGold`

Input:

- SilverRecordId

Optional future inputs:

- RunId
- Reprocess = Yes/No

### Plugin responsibility

The plugin should:

1. Retrieve Sales_Silver.
2. Retrieve active DataMapping records when mapping is required.
3. Resolve customer/product references.
4. Retrieve cost information.
5. Calculate Gold metrics.
6. Determine SalesCategory.
7. Create or update Sales_Gold.
8. Prevent duplicate Gold records for the same business key.
9. Return useful errors to the caller.

## 9. Gold formulas

```text
GrossSales = Quantity * UnitPrice

DiscountAmount = GrossSales * DiscountPct

NetSales = GrossSales - DiscountAmount

Cost = Quantity * CostPerUnit

GrossProfit = NetSales - Cost

GrossMarginPct =
    GrossProfit / NetSales
```

Guard against division by zero:

```text
if NetSales == 0:
    GrossMarginPct = 0
```

Example:

```text
Quantity = 2
UnitPrice = 1000
DiscountPct = 0.05
CostPerUnit = 700

GrossSales = 2000
DiscountAmount = 100
NetSales = 1900
Cost = 1400
GrossProfit = 500
GrossMarginPct = 26.3158%
```

## 10. SalesCategory example

Example rule:

```text
NetSales >= 2000        → "High"
NetSales >= 1000        → "Medium"
otherwise               → "Low"
```

This is only an MVP rule. In production, consider moving configurable thresholds to a BusinessRule/Configuration table.

## 11. Power Automate — Gold orchestration

After Silver is successfully generated:

1. Query Sales_Silver for the current DataSource/Run.
2. For each Silver record, call `CalculateSalesGold`.
3. Track success/error counts.
4. Update PipelineRun.
5. Update DataSource status.

For high volume, do not use an unbounded sequential `Apply to each`. Benchmark batch/concurrency and consider a queue or asynchronous processing pattern.

## 12. Idempotency

Every layer must be safe to retry.

Recommended keys:

### Bronze

`DataSourceId + RowNumber`

### Silver

`DataSourceId + OrderId`

### Gold

`SourceSystem + OrderId`

If a flow is retried, existing records should be updated or skipped rather than duplicated.

## 13. Security

Use least-privilege service accounts/connections.

Separate:

- development
- test/UAT
- production

Do not hard-code:

- Google Drive folder IDs
- environment-specific URLs
- business thresholds
- secrets

Use environment variables/configuration where appropriate.

## 14. Deployment structure

Create one Power Platform Solution:

`SalesDataPlatform`

Include:

- Dataverse tables
- Choice columns
- Alternate keys
- Relationships
- Power Automate flows
- Custom API
- Plugin assembly/steps
- Environment variables

Suggested flow names:

- `PA_Sales_File_Intake`
- `PA_Sales_Process_Silver`
- `PA_Sales_Process_Gold`

Suggested plugin:

`SalesDataPlugin.CreateSalesGold`

## 15. Testing plan

### Test 1 — Happy path

Input:

`sample_sales_2026_08.csv`

Expected:

- Bronze = 10
- Silver valid rows = 10
- Gold = 10
- PipelineRun = Completed

### Test 2 — Invalid URL

Expected:

- DataSource = Rejected
- PipelineError created
- no Bronze load

### Test 3 — Wrong extension

Example:

`Sales_2026_08.xlsx`

Expected:

- Rejected

### Test 4 — Invalid quantity

Example:

`Qty = -2`

Expected:

- Silver DataQualityStatus = Error
- PipelineError created

### Test 5 — Invalid discount

Example:

`Discount = 150%`

Expected:

- Silver DataQualityStatus = Error

### Test 6 — Duplicate OrderId

Expected:

- duplicate is detected
- no duplicate Gold record

### Test 7 — Retry

Run the same file twice.

Expected:

- no duplicate business records

### Test 8 — Zero NetSales

Expected:

- GrossMarginPct = 0
- no division-by-zero exception

## 16. Power BI

Power BI should primarily consume:

`Sales_Gold`

Suggested measures:

```text
Total Net Sales
Total Gross Profit
Gross Margin %
Order Count
Average Order Value
```

Suggested dimensions:

- Date
- Customer
- Product
- Region

Suggested visuals:

- Net Sales by Month
- Net Sales by Customer
- Net Sales by Product
- Gross Margin by Product
- Sales Category
- Pipeline/Data Quality KPI

## 17. MVP acceptance criteria

The MVP is complete when:

- A valid Google Drive URL can create a DataSource.
- The file is validated.
- The file content is loaded into Bronze.
- Bronze is transformed into typed Silver.
- Silver data quality rules work.
- Custom API can process Silver.
- Plugin creates Gold.
- Retry does not create duplicates.
- Errors are auditable.
- Power BI can consume Gold.

## 18. Recommended build order

1. Create Solution.
2. Create Dataverse tables.
3. Create relationships and alternate keys.
4. Load sample CSV manually into a test path.
5. Build Bronze ingestion.
6. Validate the complete Bronze flow.
7. Build Silver Dataflow/Power Query.
8. Validate Silver calculations.
9. Create DataMapping.
10. Create Custom API.
11. Build and register Plugin.
12. Process Silver → Gold.
13. Add error handling.
14. Add idempotency/retry.
15. Add Power BI.
16. Load-test with larger files.
17. Harden security and deployment.

## 19. Production evolution

When volume grows substantially:

```text
Google Drive
    ↓
Power Automate
    ↓
Lakehouse / Fabric / Data Factory
    ↓
Bronze
    ↓
Silver
    ↓
Gold
    ↓
Dataverse / Power BI
```

Keep Dataverse focused on operational/business data and Power Platform integration rather than treating it as a large-scale data lake.

## 20. Deliverables

This project should eventually contain:

- `plan.md`
- `data/sample_sales_2026_08.csv`
- Dataverse solution `SalesDataPlatform`
- Power Automate flows
- Power Query/Dataflow
- Plugin source code
- Custom API definition
- Test cases
- Power BI report
