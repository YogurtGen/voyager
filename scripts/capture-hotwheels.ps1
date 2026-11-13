param([ValidatePattern('^[a-z0-9-]{1,64}$')][string]$Name='game')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class GameCapture {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect rect);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
}
'@
$taskSelectedGame=if($env:WATERCONSOLE_HOTWHEELS_PATH){[IO.Path]::GetFullPath($env:WATERCONSOLE_HOTWHEELS_PATH)}else{'E:\Program Files\Games Program\Epic Games\HOTWHEELSUNLEASHED\hotwheels\Binaries\Win64\EpicGamesStore\hotwheels-Win64-Shipping.exe'}
$taskProcess=Get-Process -Name 'hotwheels-Win64-Shipping' | Where-Object { $_.Path -eq $taskSelectedGame } | Select-Object -First 1
if(-not $taskProcess){throw 'The selected original game is not running.'}
[uint32]$taskForegroundId=0
$null=[GameCapture]::GetWindowThreadProcessId([GameCapture]::GetForegroundWindow(),[ref]$taskForegroundId)
if($taskForegroundId -ne $taskProcess.Id){throw 'The selected game is not foreground; no desktop capture was taken.'}
$null=[GameCapture]::SetProcessDPIAware()
$taskRectangle=New-Object GameCapture+Rect
$null=[GameCapture]::GetWindowRect($taskProcess.MainWindowHandle,[ref]$taskRectangle)
$taskWidth=$taskRectangle.Right-$taskRectangle.Left
$taskHeight=$taskRectangle.Bottom-$taskRectangle.Top
if($taskWidth -le 0 -or $taskHeight -le 0 -or $taskWidth -gt 10000 -or $taskHeight -gt 10000){throw 'Invalid game window bounds.'}
$taskImage=[Drawing.Bitmap]::new($taskWidth,$taskHeight)
$taskGraphics=[Drawing.Graphics]::FromImage($taskImage)
try {
 $taskGraphics.CopyFromScreen($taskRectangle.Left,$taskRectangle.Top,0,0,$taskImage.Size)
 $taskFolder=Join-Path $PSScriptRoot '../.local/hotwheels-phone-test'
 New-Item -ItemType Directory -Path $taskFolder -Force | Out-Null
 $taskFile=Join-Path $taskFolder ($Name+'.png')
 $taskImage.Save($taskFile,[Drawing.Imaging.ImageFormat]::Png)
 Write-Output $taskFile
} finally {$taskGraphics.Dispose();$taskImage.Dispose()}


