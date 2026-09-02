param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('SetWatch', 'ReplaceWatches', 'AddModel')]
    [string]$Action,
    [Parameter(Mandatory = $true)]
    [string]$ToolRoot,
    [string]$ModelName,
    [string]$Keyword,
    [string]$KeywordsJson,
    [string]$Note,
    [string]$Enabled = 'true',
    [string]$ParentAsin,
    [string]$Site = '加拿大站点'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ToolRoot = [IO.Path]::GetFullPath($ToolRoot)
$importScript = Join-Path $ToolRoot 'import_keyword_rank.ps1'
if (-not (Test-Path -LiteralPath $importScript)) { throw "找不到导入脚本：$importScript" }

if ($Action -eq 'SetWatch') {
    $ModelName = $ModelName.Trim()
    $Keyword = $Keyword.Trim()
    if ([string]::IsNullOrWhiteSpace($ModelName)) { throw '产品型号不能为空。' }
    if ([string]::IsNullOrWhiteSpace($Keyword)) { throw '关键词不能为空。' }
    & $importScript -RefreshOnly -NoPause -AppAction 'SetWatch' -AppModelName $ModelName -AppKeyword $Keyword -AppNote $Note -AppEnabled $Enabled
}
elseif ($Action -eq 'ReplaceWatches') {
    $ModelName = $ModelName.Trim()
    if ([string]::IsNullOrWhiteSpace($ModelName)) { throw '产品型号不能为空。' }
    if ([string]::IsNullOrWhiteSpace($KeywordsJson)) { throw '关注词顺序不能为空。' }
    & $importScript -RefreshOnly -NoPause -AppAction 'ReplaceWatches' -AppModelName $ModelName -AppKeywordsJson $KeywordsJson
}
else {
    $ModelName = $ModelName.Trim()
    $ParentAsin = $ParentAsin.Trim().ToUpperInvariant()
    $Site = $Site.Trim()
    if ([string]::IsNullOrWhiteSpace($ModelName)) { throw '产品名称不能为空。' }
    if ($ParentAsin -notmatch '^B0[A-Z0-9]{8}$') { throw '父体 ASIN 格式不正确，应为 B0 开头的 10 位字符。' }
    if ([string]::IsNullOrWhiteSpace($Site)) { $Site = '加拿大站点' }
    & $importScript -NoPause -OnlyAsin $ParentAsin -AppAction 'AddModel' -AppModelName $ModelName -AppParentAsin $ParentAsin -AppSite $Site
}

if (-not $?) { throw '操作未成功完。' }
Write-Host '操作完成。'
