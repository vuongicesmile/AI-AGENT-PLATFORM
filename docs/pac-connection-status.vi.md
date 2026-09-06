# Kết nối PAC và kiểm tra thay đổi / publish / deploy

Ngày kiểm tra local: 2026-09-05; xác minh tenant và export baseline: 2026-09-06 (UTC+7). Phạm vi: repo hiện tại và environment/solution do người dùng cung cấp. Đây là kiểm tra trạng thái; không thực hiện import hoặc publish để tạo sự kiện thử.

## Kết quả local

| Hạng mục | Kết quả đã kiểm tra |
| --- | --- |
| PAC CLI | Đã cài bản `2.11.2` bằng .NET Tool của Microsoft |
| Git | Nhánh `main`, commit `ff3d6a6`; sau `git fetch origin`, ahead/behind là `0/0` |
| Thay đổi chưa commit | Tài liệu `docs/` và công cụ `scripts/`; xem lại bằng `git status` khi cần |
| Demo Sales | Chạy lại `node --test tests/pipeline.test.mjs`: **11/11 pass** |
| C# plugin | Có logic `net8.0`; chưa có bằng chứng assembly sandbox đã build/register/deploy. Không chạy lại test C# trong lần kiểm tra này |
| Solution source | Đã export/unpack baseline vào `.dataverse/snapshots/20260906-initial/`; các thư mục solution theo dõi trong Git vẫn là placeholder/blueprint |
| CI/CD | Chưa có pipeline deploy thực thi trong repo |
| Kết nối tenant | PAC profile `ai-agent-platform` đã đăng nhập; `pac env who` trả về đúng Environment ID người dùng cung cấp |

## Kết quả trực tiếp từ tenant

| Hạng mục | Kết quả |
| --- | --- |
| Solution | `Sales Data Platform Demo`, unique name `SalesDataPlatformDemo` |
| Phiên bản | `1.0.0.0`, **Unmanaged** |
| Publisher | `SalesDataPlatformDemoPublisher`, prefix **`sdp`** |
| Component | **5 bảng** theo truy vấn `solutioncomponent` và manifest của bản export |
| Model-driven app / flow | Không trả về component thuộc hai loại này trong solution được kiểm tra |
| Plugin / Custom API / Canvas app | Không có trong component inventory hoặc package của solution này |
| Import job | Truy vấn `importjob` theo Solution ID không trả về bản ghi; không suy ra chưa từng có bất kỳ deploy nào |
| Solution history | API `solutionhistorydata` trả lỗi `Restricted API is not called by Microsoft publisher plugin`; chưa đọc được lịch sử tổng thể qua PAC |
| Export/unpack | Thành công, package 29.689 byte, source **65 file** |
| Công cụ status | Chạy trực tiếp thành công **8/8 lệnh** sau khi sửa FetchXML phân trang; exit code này không đại diện cho deployment success |

| Bảng trong snapshot | Logical name |
| --- | --- |
| SDP Pipeline Batch | `sdp_pipelinebatch` |
| SDP Pipeline Error | `sdp_pipelineerror` |
| SDP Sales Bronze | `sdp_salesbronze` |
| SDP Sales Silver | `sdp_salessilver` |
| SDP Sales Gold | `sdp_salesgold` |

Đối chiếu với `plan.md`: đã có ba bảng Bronze/Silver/Gold và bảng lỗi. `PipelineBatch` đang chứa cả thông tin file, run key và số lượng theo tầng; chưa có các bảng `DataSource`, `PipelineRun`, `DataMapping` riêng trong solution này. Không mặc định `PipelineBatch` đáp ứng đầy đủ thiết kế `ProcessingBatch`/`PipelineRun` của kế hoạch mới. Snapshot có các cột `sdp_batchkey`/`sdp_recordkey` nhưng chưa thấy định nghĩa alternate key; cột text có tên Key tự nó chưa bảo đảm tính duy nhất/idempotency.

Mốc bằng chứng local: `.dataverse/status/20260905T170457811018Z/report.json` (00:04:57 ngày 06/09 giờ UTC+7) và `.dataverse/snapshots/20260906-initial/source/Other/Solution.xml`. Snapshot là bản export tại một thời điểm, không phải kết luận mọi draft đã publish hoặc pipeline đã chạy end-to-end. Chưa xác minh các artifact có thể tồn tại ngoài solution này.

Cấu hình định danh environment/solution ở `.dataverse/connection.json`. Thư mục này đã được `.gitignore` loại trừ; không đưa cấu hình tenant, snapshot hoặc log từ tenant vào Git. File `docs/requirment.md` hiện có các ý tưởng debugger/log, field notification, command button, Xrm navigation, plugin, Azure Function, connector và Service Bus/Automate; chúng là yêu cầu bổ sung, chưa phải bằng chứng đã triển khai.

## Đăng nhập bằng PAC

PAC chấp nhận Environment ID trong đường dẫn maker portal. Solution ID dùng để truy vấn solution; lệnh export/import sử dụng **unique name** hoặc package, không dùng nguyên URL maker portal. [Tài liệu PAC auth](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/auth).

Chạy tại thư mục gốc repo:

```powershell
$pac = Join-Path $env:USERPROFILE '.dotnet\tools\pac.exe'
$target = Get-Content .dataverse\connection.json -Raw | ConvertFrom-Json
& $pac auth list
& $pac auth create --name ai-agent-platform --environment $target.environmentId --deviceCode
& $pac env who --environment $target.environmentId --json
```

Chỉ tạo profile khi chưa có profile phù hợp. Khi đã đăng nhập, dùng lại profile hiện có. Mã device code chỉ nhập trên trang Microsoft mà PAC hiển thị; không lưu mã, mật khẩu hoặc token vào repo. `org` vẫn là alias của `env`; cú pháp hiện tại ưu tiên `pac env`. [PAC env](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/env).

## Kiểm tra lại sau mỗi lần thay đổi

```powershell
git fetch origin
python scripts\power_platform_status.py
```

Script dùng thư viện chuẩn Python và PAC đang cài. Các lệnh truy vấn đều chỉ rõ Environment ID; quyền đọc được thực thi bằng tài khoản PAC. Nếu không xác thực được environment, script dừng trước các truy vấn solution. Không tự đăng nhập, không thay đổi connection references, không sửa dữ liệu.

Mỗi lần chạy tạo thư mục `.dataverse/status/<UTC timestamp>/`:

| File | Dùng để đọc |
| --- | --- |
| `git-status.txt`, `git-head.txt` | Thay đổi local và commit đang kiểm tra; thông tin remote dựa vào lần fetch gần nhất |
| `environment.txt` | Environment thực tế và danh tính PAC kết nối được |
| `solution.txt` | Unique name, version, managed/unmanaged, modified time, publisher của solution theo đúng ID |
| `components.txt` | Số lượng component theo loại trong solution |
| `import-jobs.txt` | Import job gắn với Solution ID: thời gian bắt đầu/kết thúc và progress; chưa tải XML kết quả chi tiết |
| `history.txt` | Chỉ có khi bật `--include-solution-history`; ghi kết quả hoặc lỗi từ API lịch sử |
| `model-apps.txt` | Model-driven apps thuộc solution: thời điểm publish, modified time và trạng thái |
| `workflows.txt` | Process/flow thuộc solution: loại, trạng thái và modified time |
| `report.json` | Thời điểm chụp và exit code từng lệnh; lệnh nào lỗi được giữ riêng trong log |

Exit code `0` của script nghĩa là các lệnh truy vấn chạy thành công. Nó không tự kết luận deploy thành công, mọi component đã publish, hay flow chạy tốt. Kết quả rỗng có thể do solution không tồn tại hoặc quyền hạn; phải xem `solution.txt` trước khi diễn giải các bảng khác. Lỗi quyền đọc hoặc lỗi query được báo là chưa kiểm tra được, không đổi thành số lượng 0.

PAC tự quản lý paging; script dùng `count` làm kích thước trang, không dùng `top` và không hứa số lượng tối đa của toàn bộ kết quả. API solution history đang bị từ chối trong tenant nên mặc định chỉ truy vấn import jobs. Có thể xem lịch sử bằng mục **See history** trên maker portal theo quyền tài khoản; việc đọc portal chưa được kiểm chứng trong lần này. Chỉ bật `--include-solution-history` khi cần kiểm tra lại khả năng đọc API; lệnh bị từ chối sẽ khiến báo cáo có exit code khác 0. Chưa cấu hình lịch chạy nền hay thông báo tự động.

## Phân biệt bốn loại trạng thái

| Câu hỏi | Bằng chứng cần đối chiếu |
| --- | --- |
| Code local có thay đổi không? | `git status`, `git diff`, commit và test |
| Portal có thay đổi so với source không? | Export + unpack cùng solution ở hai thời điểm rồi diff các file; cần baseline đầu tiên |
| Thay đổi đã publish chưa? | Trạng thái và thời gian publish theo từng app/component; kiểm tra draft trong designer khi cần |
| Deploy có thành công không? | Import job/history đúng thời điểm, version, kết quả/lỗi; sau đó kiểm tra component, connection, quyền và smoke test |

Solution history ghi nhận import, export, uninstall; không thay thế lịch sử mọi lần sửa/publish trên portal. Microsoft tự dọn history quá 180 ngày. `status = End` chỉ nói tác vụ đã kết thúc; vẫn phải đọc kết quả và lỗi. [Solution history](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/solution-history), [SolutionHistoryData](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/solutionhistorydata).

`publishedon` là thời điểm publish model-driven app. `componentstate` là trường trạng thái nội bộ, chỉ dùng hỗ trợ điều tra; một bản ghi Published không chứng minh không còn thay đổi draft trong mọi thành phần. Flow Activated cũng chưa chứng minh lần chạy gần nhất thành công; cần mở run history của flow. [AppModule](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/appmodule), [Workflow](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/workflow).

Canvas app/custom page cần đối chiếu phiên bản saved/live riêng; script này chưa đọc lịch sử phiên bản Canvas. Kết quả model-driven app không đại diện cho Canvas, Power BI, Dataflow hoặc Copilot Studio.

## Baseline và luồng ALM tiếp theo

1. Auth, xác minh environment, solution và publisher đã hoàn tất cho lần kiểm tra này. Mỗi phiên sau tiếp tục kiểm tra profile và environment thực tế.
2. Baseline unmanaged đầu tiên đã có trong `.dataverse/snapshots/20260906-initial/`. Với lần kiểm tra sau, export vào thư mục snapshot mới và unpack bằng PAC ở lệnh riêng. Không tự publish trước export. Export chỉ là ảnh chụp phần được đóng gói và không chứng minh mọi draft đã được lưu vào package.
3. Sau một thay đổi được yêu cầu, chạy lại status và tạo snapshot mới; diff với baseline. Xem từng component thay đổi trước khi đồng bộ vào source repo. Không ghi đè local source đang sửa.
4. Trước deploy, build đúng loại artifact, chạy test/Solution Checker phù hợp, kiểm tra dependency, environment variables và connection references. Tạo package/release manifest cụ thể để review.
5. Khi đã được cho phép deploy tới target xác định, import package và theo dõi đúng job. PAC có `--async` và `--max-async-wait-time`; thời gian chờ hết không có nghĩa job đã thất bại. Không tự import lại chỉ vì timeout.
6. Sau deploy, chạy status, xác minh version và import history, kiểm tra app/flow và smoke test bằng dữ liệu phù hợp. Publish là bước riêng theo loại component; tránh dùng publish-all để kiểm tra trạng thái.

Ví dụ export/unpack sau khi đã đọc **unique name thực tế** và xác nhận đây là solution unmanaged:

```powershell
$solutionName = $target.solutionUniqueName
$snapshot = Join-Path '.dataverse\snapshots' (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Path $snapshot
& $pac solution export --environment $target.environmentId --name $solutionName --managed false --path "$snapshot\solution.zip"
# Chỉ tiếp tục khi export thành công; thực thi unpack ở bước riêng.
& $pac solution unpack --zipfile "$snapshot\solution.zip" --folder "$snapshot\source" --packagetype Unmanaged
# Exit code 1 của git diff --no-index nghĩa là có khác biệt; >1 là lỗi.
git diff --no-index -- .dataverse\snapshots\20260906-initial\source "$snapshot\source"
```

Package managed đang cài không phải nguồn có thể export ngược thành unmanaged để phát triển. Với Test/Prod phải lấy source/package từ môi trường phát triển hoặc pipeline sở hữu. Tham chiếu: [PAC solution](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/solution).

Đối chiếu yêu cầu: `plan.md` — triển khai Power Platform; kế hoạch tiếng Việt — M0 xác minh tenant, M7 ALM/UAT. Không gán trạng thái hoàn thành FR/NFR của dự án FM chỉ từ kết quả kiểm tra local này.
