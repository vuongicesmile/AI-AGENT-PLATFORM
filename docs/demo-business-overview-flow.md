flowchart TD
    STAFF["Nhân viên gửi link CSV trong Power Apps"] --> INTAKE["Automate kiểm tra file và gọi Function đọc CSV"]
    DRIVE["Google Drive: file nguồn"] --> INTAKE
    INTAKE --> BRONZE["Bronze: giữ dữ liệu nhận được"]
    BRONZE --> SILVER["Dataflow tạo Silver: chuẩn hóa và đánh dấu lỗi"]
    SILVER --> CHECK{"Dữ liệu đạt kiểm tra?"}
    CHECK -->|Có| GOLD["Custom API và plugin tạo Gold: doanh thu, giá vốn, lợi nhuận"]
    GOLD --> GATE["Đối soát và cho phép dùng kết quả"]
    GATE --> REPORT["Power BI cập nhật báo cáo cho quản lý"]
    CHECK -->|Chưa đạt| REVIEW["Người phụ trách xem lỗi trên Power Apps"]
    REVIEW --> FIX["Sửa nguồn hoặc cấu hình, tạo batch mới"]
    FIX --> STAFF
    WATCH["Timer qua Service Bus: kiểm tra batch chậm"] --> OPS["Người vận hành xem cảnh báo và log"]
    INTAKE -.-> OPS
    GOLD -.-> OPS
