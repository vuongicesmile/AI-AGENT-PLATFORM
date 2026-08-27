# Power Platform CLI Learning

Repository thực hành Microsoft Power Platform CLI (`pac`) và Power Apps Component Framework (PCF).

## Yêu cầu

- Node.js và npm
- Power Platform CLI
- Một Power Platform environment có Dataverse (cho các bài cần kết nối)

Kiểm tra công cụ:

```powershell
node --version
npm --version
pac help
```

## Chạy project PCF

```powershell
npm install
npm run build
npm start
```

Control mẫu nằm trong thư mục `PL400component`.

## Các lệnh PAC CLI cơ bản

### Đăng nhập

```powershell
pac auth create --name dev
pac auth list
pac auth select --name dev
pac org who
```

### Tạo project PCF mới

```powershell
pac pcf init --namespace Learning --name SampleControl --template field
npm install
npm run build
```

### Làm việc với solution

```powershell
pac solution init --publisher-name Learning --publisher-prefix learn
pac solution add-reference --path ..\power-app.pcfproj
dotnet build
```

### Xuất và giải nén solution

```powershell
pac solution export --name MySolution --path .\artifacts\MySolution.zip
pac solution unpack --zipfile .\artifacts\MySolution.zip --folder .\solutions\MySolution
```

## Lộ trình thực hành

1. Làm quen với `pac help`, `pac auth` và `pac org`.
2. Build và chạy test harness của PCF control.
3. Tạo solution, thêm PCF project vào solution.
4. Kết nối Dataverse environment và deploy solution.
5. Export/unpack solution để quản lý source bằng Git.

> Không commit thông tin đăng nhập, token, file `.env`, hoặc dữ liệu bí mật lên repository.
