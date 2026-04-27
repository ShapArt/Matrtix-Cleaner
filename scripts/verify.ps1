param(
  [switch]$SkipBrowser
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
}

& (Join-Path $PSScriptRoot "bootstrap-node.ps1") -Root $root

$nodeBin = Join-Path $root ".bootstrap\node"
$env:PATH = "$nodeBin;$env:PATH"

$npm = Join-Path $nodeBin "npm.cmd"
if (-not (Test-Path $npm)) {
  throw "Local npm.cmd was not found at $npm"
}

Write-Host "Using node: $(& node --version)"
Write-Host "Using npm: $(& npm --version)"

if (-not (Test-Path (Join-Path $root "node_modules"))) {
  Write-Host "Installing npm dependencies..."
  Invoke-Checked $npm install
}

if ($SkipBrowser) {
  Invoke-Checked $npm run verify:core
} else {
  Write-Host "Ensuring Playwright Chromium is installed..."
  Invoke-Checked $npm exec -- playwright install chromium
  Invoke-Checked $npm run verify
}
