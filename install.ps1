<#
 install.ps1 - Bootstrap 32-bit Node.js and install npm dependencies
#>
param()
$ErrorActionPreference = 'Stop'

# Determine script root (folder containing this script)
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
# Path to 32-bit npm for COM automation
$NPM32 = Join-Path $scriptRoot 'node32\npm.cmd'

# Helper: write error and exit
function ExitIfFailed {
    param([string]$Message)
    Write-Error $Message
    exit 1
}

# 1. Download and extract 32-bit Node.js into node32
if (-not (Test-Path (Join-Path $scriptRoot 'node32'))) {
    Write-Host "Downloading Node.js v22.16.0 x86..."
    try {
        Invoke-WebRequest 'https://nodejs.org/dist/v22.16.0/node-v22.16.0-win-x86.zip' -OutFile 'node.zip' -UseBasicParsing -ErrorAction Stop
    } catch {
        ExitIfFailed "Failed to download Node.js: $_"
    }
    Write-Host "Extracting Node.js..."
    try {
        Expand-Archive -Path 'node.zip' -DestinationPath $scriptRoot -ErrorAction Stop
    } catch {
        ExitIfFailed "Failed to extract node.zip: $_"
    }
    $nodeDir = Get-ChildItem -Path $scriptRoot -Directory | Where-Object { $_.Name -like 'node-v*-win-x86' }
    if ($nodeDir) {
        Rename-Item -Path (Join-Path $scriptRoot $nodeDir.Name) -NewName 'node32'
        Write-Host "node32 ready."
    } else {
        ExitIfFailed 'Unexpected archive contents: missing node-v22.16.0-win-x86.'
    }
    Remove-Item 'node.zip'
} else {
    Write-Host "node32 folder exists; skipping download."
}

# 2. Install npm dependencies and rebuild winax for one-s-rest
function Install-NpmDependencies {
    param(
        [string]$ProjectDir,
        [switch]$UseNode32
    )
    Write-Host "Installing npm dependencies in $ProjectDir..."
    Push-Location $ProjectDir
    if ($UseNode32) {
        & $NPM32 install
        if ($LASTEXITCODE -ne 0) { ExitIfFailed "npm install failed in $ProjectDir" }
    } else {
        npm install
        if ($LASTEXITCODE -ne 0) { ExitIfFailed "npm install failed in $ProjectDir" }
    }
    Pop-Location
}

# Execute installations
Install-NpmDependencies (Join-Path $scriptRoot 'demo-telegram-bot')
Install-NpmDependencies (Join-Path $scriptRoot 'one-s-rest') -UseNode32

# 3. Copy winax build into one-s-rest node module
Write-Host "Copying prebuild ia32 winax ..."
$src = Join-Path $scriptRoot 'winax'
$dst = Join-Path $scriptRoot 'one-s-rest\node_modules\winax'
& robocopy $src $dst /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
Install-NpmDependencies (Join-Path $scriptRoot 'report-watcher')
Write-Host "All done."