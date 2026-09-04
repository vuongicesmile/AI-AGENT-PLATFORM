# Tổng quan giải pháp RMIT FM

## 1. Mục tiêu

Xây dựng một nền tảng dữ liệu và tự động hóa cho Facilities Management (FM), kết nối Johnson Controls BMS, Schneider PME, Archibus, biểu mẫu checklist và các quy trình FM.

Nền tảng cần cung cấp:

- Ingestion dữ liệu water, power và power quality.
- Historical data migration có đối soát.
- Digital checklist và manual meter reading.
- Workflow cho CIWG, risk register và FM projects.
- Báo cáo Power BI và một FM Portal tập trung.
- Data lineage đầy đủ từ source đến dashboard.

## 2. Ràng buộc đã biết

- BMS và PME đặt on-premises.
- Protocol đã xác nhận: BACnet/IP và Modbus.
- Khoảng 20 meters/feeders và 30 users.
- Notification dùng email; không tự thêm Teams.
- Offline data entry không cần triển khai.
- QR code là cách nhận diện chính; phải có fallback bằng asset ID.
- Quy mô hiện tại: 2 water meters và 14 checklists; thiết kế mở rộng tối thiểu 5 equipment và 20 checklists.
- .NET/C# được ưu tiên cho integration service.

## 3. Điểm cần quyết định

Fabric/OneLake được loại khỏi phase này vì chỉ là suggestion. Bronze/Silver/Gold sẽ là các bảng Dataverse, được xử lý bằng Power Automate/Dataverse và phục vụ qua Power BI. Vẫn cần chốt tenant, license/capacity, gateway và network trước production.

Latency cũng chưa thống nhất: một câu trả lời nêu tối đa 5 phút, câu khác nêu tối đa 1 phút sau khi refresh. Dev phải đo riêng freshness và dashboard render time.
