param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
$voyagerRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$voyagerOutput = [IO.Path]::GetFullPath($OutputPath)
if (-not $voyagerOutput.StartsWith($voyagerRoot + '\releases\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Source archive must be under project releases.' }
if (Test-Path -LiteralPath $voyagerOutput) { throw 'Refusing to overwrite an existing source archive.' }
New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($voyagerOutput)) -Force | Out-Null
& git -C $voyagerRoot archive --format=zip --prefix=voyager/ ('--output=' + $voyagerOutput) HEAD
if ($LASTEXITCODE -ne 0) { throw 'Commit the reviewed public source before making a source archive.' }
