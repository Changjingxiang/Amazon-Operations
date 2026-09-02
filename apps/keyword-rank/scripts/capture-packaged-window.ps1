param(
    [Parameter(Mandatory = $true)][string]$ExecutablePath,
    [Parameter(Mandatory = $true)][string]$ToolRoot,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowCaptureNative {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint flags);
}
'@

$resolvedExe = (Resolve-Path -LiteralPath $ExecutablePath).Path
$resolvedRoot = (Resolve-Path -LiteralPath $ToolRoot).Path
$beforeIds = @(Get-Process | Select-Object -ExpandProperty Id)
$previousRoot = $env:KEYWORD_TOOL_ROOT
try {
    $env:KEYWORD_TOOL_ROOT = $resolvedRoot
    $launcher = Start-Process -FilePath $resolvedExe -WorkingDirectory (Split-Path -Parent $resolvedExe) -PassThru
} finally {
    if ($null -eq $previousRoot) { Remove-Item Env:KEYWORD_TOOL_ROOT -ErrorAction SilentlyContinue }
    else { $env:KEYWORD_TOOL_ROOT = $previousRoot }
}

try {
    $windowProcess = $null
    for ($attempt = 0; $attempt -lt 80 -and -not $windowProcess; $attempt++) {
        Start-Sleep -Milliseconds 500
        foreach ($candidate in Get-Process) {
            if ($candidate.MainWindowHandle -eq 0) { continue }
            $candidatePath = $null
            try { $candidatePath = $candidate.Path } catch {}
            if ($candidatePath -eq $resolvedExe) {
                $windowProcess = $candidate
                break
            }
        }
    }
    if (-not $windowProcess) { throw 'No capturable application window was found.' }
    [WindowCaptureNative]::SetForegroundWindow($windowProcess.MainWindowHandle) | Out-Null
    Start-Sleep -Seconds 2
    $rect = New-Object WindowCaptureNative+RECT
    if (-not [WindowCaptureNative]::GetWindowRect($windowProcess.MainWindowHandle, [ref]$rect)) {
        throw 'Unable to read the application window bounds.'
    }
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    $bitmap = New-Object System.Drawing.Bitmap $width, $height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $deviceContext = $graphics.GetHdc()
    try {
        $captured = [WindowCaptureNative]::PrintWindow($windowProcess.MainWindowHandle, $deviceContext, 2)
        if (-not $captured) { throw 'PrintWindow failed to capture the application.' }
    } finally {
        $graphics.ReleaseHdc($deviceContext)
        $graphics.Dispose()
    }
    try {
        $destination = [System.IO.Path]::GetFullPath($OutputPath)
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($destination)) | Out-Null
        $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Output $destination
    } finally {
        $bitmap.Dispose()
    }
} finally {
    Get-Process | Where-Object { $beforeIds -notcontains $_.Id } | Where-Object {
        try { $_.Path -and $_.Path.StartsWith((Split-Path -Parent $resolvedExe), [System.StringComparison]::OrdinalIgnoreCase) }
        catch { $false }
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    if ($launcher -and -not $launcher.HasExited) {
        Stop-Process -Id $launcher.Id -Force -ErrorAction SilentlyContinue
    }
}
