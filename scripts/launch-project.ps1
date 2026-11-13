param([switch]$Windowed)
$ErrorActionPreference = 'Stop'
$voyagerRoot = Split-Path -Parent $PSScriptRoot
try {
  $voyagerNode = (Get-Command node -ErrorAction Stop).Source
  $voyagerArgs = '"' + (Join-Path $PSScriptRoot 'launch-project.mjs') + '"'
  if ($Windowed) { $voyagerArgs += ' --windowed' }
  Start-Process -FilePath $voyagerNode -ArgumentList $voyagerArgs -WorkingDirectory $voyagerRoot -WindowStyle Hidden
} catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show('Voyager needs Node.js and the project dependencies. Ask your coding assistant to check the project setup.', 'Voyager') | Out-Null
}
