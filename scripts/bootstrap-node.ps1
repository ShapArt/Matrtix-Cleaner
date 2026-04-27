param(
  [string]$NodeMajor = "22",
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$bootstrapDir = Join-Path $Root ".bootstrap"
$nodeDir = Join-Path $bootstrapDir "node"
$nodeExe = Join-Path $nodeDir "node.exe"

if (Test-Path $nodeExe) {
  Write-Host "OK local node: $nodeExe"
  & $nodeExe --version
  exit 0
}

New-Item -ItemType Directory -Force -Path $bootstrapDir | Out-Null

$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
$indexUrl = "https://nodejs.org/dist/latest-v$NodeMajor.x/"
Write-Host "Fetching Node index: $indexUrl"
$index = Invoke-WebRequest -UseBasicParsing -Uri $indexUrl
$pattern = "node-v[0-9]+\.[0-9]+\.[0-9]+-win-$arch\.zip"
$zipName = ([regex]::Matches($index.Content, $pattern) | Select-Object -First 1).Value
if (-not $zipName) {
  throw "Could not find a Windows Node ZIP for major $NodeMajor and arch $arch at $indexUrl"
}

$zipUrl = "$indexUrl$zipName"
$zipPath = Join-Path $bootstrapDir $zipName
Write-Host "Downloading $zipUrl"
Invoke-WebRequest -UseBasicParsing -Uri $zipUrl -OutFile $zipPath

$extractRoot = Join-Path $bootstrapDir "_node_extract"
if (Test-Path $extractRoot) {
  Remove-Item -LiteralPath $extractRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot -Force

$expanded = Get-ChildItem -LiteralPath $extractRoot -Directory | Select-Object -First 1
if (-not $expanded) {
  throw "Node ZIP did not contain an extracted directory."
}

if (Test-Path $nodeDir) {
  Remove-Item -LiteralPath $nodeDir -Recurse -Force
}
Move-Item -LiteralPath $expanded.FullName -Destination $nodeDir
Remove-Item -LiteralPath $extractRoot -Recurse -Force

if (-not (Test-Path $nodeExe)) {
  throw "Bootstrap finished but node.exe was not found at $nodeExe"
}

Write-Host "OK local node installed: $nodeExe"
& $nodeExe --version
