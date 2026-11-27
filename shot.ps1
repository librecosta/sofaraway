param(
  [Parameter(Mandatory=$true)][string]$Url,
  [Parameter(Mandatory=$true)][string]$Out,
  [int]$W = 1280,
  [int]$H = 720,
  [int]$Budget = 8000
)
$ErrorActionPreference = 'Stop'
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) { $chrome = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" }
if (Test-Path $Out) { Remove-Item $Out -Force }
$profileDir = Join-Path $env:TEMP ("chr-shot-" + [guid]::NewGuid().ToString("N").Substring(0,8))
$args = @(
  "--headless=new",
  "--user-data-dir=$profileDir",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--hide-scrollbars",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--disable-gpu-sandbox",
  "--force-device-scale-factor=1",
  "--window-size=$W,$H",
  "--virtual-time-budget=$Budget",
  "--screenshot=$Out",
  $Url
)
& $chrome @args 2>&1 | Out-Null
if (Test-Path $Out) {
  Write-Output "OK $Out $((Get-Item $Out).Length) bytes"
} else {
  Write-Output "FAILED: no screenshot produced"
}
Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue
