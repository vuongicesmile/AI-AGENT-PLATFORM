$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VenvPath = Join-Path $ProjectRoot ".venv"
$PythonPath = Join-Path $VenvPath "Scripts\python.exe"

if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python 3.10+ was not found. Install Python, then run this script again."
}

if (-not (Test-Path $PythonPath)) {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3 -m venv $VenvPath
    } else {
        & python -m venv $VenvPath
    }
}

& $PythonPath -m pip install --upgrade pip
& $PythonPath -m pip install --editable $ProjectRoot
& $PythonPath -m unittest discover -s (Join-Path $ProjectRoot "tests") -v

Write-Host "Setup complete."
Write-Host "Activate with: $VenvPath\Scripts\Activate.ps1"
