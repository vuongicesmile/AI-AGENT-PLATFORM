flowchart TD
    U["Người gửi dữ liệu"] --> APP["Power Apps: Sales Operations"]
    APP --> IN["Power Automate: Intake"]
    GD["Google Drive CSV"] --> IN
    IN --> PARSE["Custom API C#: parse/hash file nhỏ"]
    PARSE --> B[("Dataverse Bronze: raw + snapshot")]
    B --> PQ["Dataflow: Power Query M"]
    PQ --> S[("Dataverse Silver: typed + quality")]
    S --> Q{"Dữ liệu hợp lệ?"}
    Q -->|Có| API["Custom API C#: CalculateSalesGold"]
    MD[("Master data + mapping + rule version")] --> PQ
    MD --> API
    API --> G[("Dataverse Gold: candidate")]
    G --> PUB["Đối soát và publish batch"]
    PUB --> BI["Power BI: semantic model và report"]
    BI --> V["Người xem báo cáo"]
    Q -->|Lỗi| E["PipelineError: review và reprocess"]
    E --> APP
    CT[("DataSource + Batch + Run")] -.-> IN
    CT -.-> PQ
    CT -.-> PUB
