# Chuẩn bị khóa ký plugin local; chỉ tạo khi chưa tồn tại, không in khóa ra log.
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
$keyDirectory = Join-Path $repoPath '.dataverse\keys'
$keyPath = Join-Path $keyDirectory 'SalesDemo.Plugin.snk'
[System.IO.Directory]::CreateDirectory($keyDirectory) | Out-Null
if (-not (Test-Path -LiteralPath $keyPath)) {
    $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
    try {
        $rsa.PersistKeyInCsp = $false
        [System.IO.File]::WriteAllBytes($keyPath, $rsa.ExportCspBlob($true))
    } finally { $rsa.Dispose() }
    Write-Output 'Created local plugin signing key (Git ignored).'
} else { Write-Output 'Reusing existing plugin signing key.' }
