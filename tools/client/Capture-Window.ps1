#requires -Version 7.0
param([Parameter(Mandatory)][int]$TargetPid,[Parameter(Mandatory)][string]$OutputPath)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'Requires Windows'}
if(Test-Path -LiteralPath $OutputPath){throw 'Capture output must be new'}
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WC3Capture {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd,out RECT rect);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd,IntPtr hdc,uint flags);
}
'@
$p=Get-Process -Id $TargetPid;$p.Refresh()
if($p.MainWindowHandle -eq [IntPtr]::Zero){throw 'Owned client has no window'}
$r=New-Object WC3Capture+RECT
if(-not [WC3Capture]::GetClientRect($p.MainWindowHandle,[ref]$r)){throw 'Client rectangle unavailable'}
$w=$r.Right-$r.Left;$h=$r.Bottom-$r.Top
if($w -lt 1 -or $h -lt 1 -or $w -gt 7680 -or $h -gt 4320){throw 'Invalid window dimensions'}
$bitmap=[System.Drawing.Bitmap]::new($w,$h);$graphics=[System.Drawing.Graphics]::FromImage($bitmap);$hdc=$graphics.GetHdc()
try{if(-not [WC3Capture]::PrintWindow($p.MainWindowHandle,$hdc,1)){throw 'Capture failed'}}finally{$graphics.ReleaseHdc($hdc);$graphics.Dispose()}
try{$bitmap.Save($OutputPath,[System.Drawing.Imaging.ImageFormat]::Png)}finally{$bitmap.Dispose()}
# Only the owned game's client window is requested. GPU windows may yield a
# black image: a saved PNG is CAPTURED_UNVALIDATED, never visual acceptance.
