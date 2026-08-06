param(
    [ValidateRange(1, 65535)]
    [int]$Port = 5010
)

$ErrorActionPreference = "Stop"
$backendDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonExecutable = Join-Path $backendDirectory ".venv\Scripts\python.exe"
$frontendIndex = Join-Path (Split-Path -Parent $backendDirectory) "frontend\build\index.html"

if (-not (Test-Path -LiteralPath $pythonExecutable)) {
    throw "A projekt virtuális Python-környezete nem található: $pythonExecutable"
}
if (-not (Test-Path -LiteralPath $frontendIndex)) {
    throw "A production frontend build nem található. Előbb futtasd a frontend buildet."
}

Set-Location -LiteralPath $backendDirectory
& $pythonExecutable -m uvicorn server:app --host 0.0.0.0 --port $Port
