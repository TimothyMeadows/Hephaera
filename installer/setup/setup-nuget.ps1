# Compatible with Windows PowerShell 5.1. Forward values as an argument array.
$ErrorActionPreference = 'Stop'
$setupScript = Join-Path $PSScriptRoot 'setup-local-tool.cjs'
& node $setupScript @args
if ($null -eq $LASTEXITCODE) { exit 69 }
exit $LASTEXITCODE
