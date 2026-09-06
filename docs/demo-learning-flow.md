flowchart TD
    USER["Bạn: nhập URL CSV"] --> APP["Model-driven app: form và notification"]
    APP --> BUTTON["Command: Theo dõi batch"]
    BUTTON --> PAGE["Xrm mở custom page của batch"]
    PAGE --> REQUEST["Gửi xử lý: lưu Requested"]
    REQUEST --> FLOW["Power Automate: nhận và kiểm tra file"]
    DRIVE["Google Drive: CSV 10 dòng"] --> FLOW
    FLOW --> CONNECTOR["Custom connector: ParseSalesCsv"]
    CONNECTOR --> HTTP["Azure Function HTTP: CSV thành các dòng raw"]
    HTTP --> BRONZE[("Dataverse Bronze")]
    BRONZE --> DATAFLOW["Power Query Dataflow: chuẩn hóa"]
    DATAFLOW --> SILVER[("Dataverse Silver")]
    SILVER --> GOLDAPI["Automate gọi Custom API và C# plugin"]
    GOLDAPI --> GOLD[("Dataverse Gold")]
    GOLD --> PAGE
    TIMER["Azure Function Timer: mỗi 5 phút"] --> QUEUE["Service Bus: tín hiệu WatchdogTick"]
    QUEUE --> WATCH["Automate: kiểm tra batch chạy quá lâu"]
    FLOW -.-> ERROR[("PipelineError và log kỹ thuật")]
    GOLDAPI -.-> ERROR
    WATCH --> ERROR
    ERROR --> PAGE
