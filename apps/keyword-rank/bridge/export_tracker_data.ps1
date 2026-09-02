param(
    [Parameter(Mandatory = $true)]
    [string]$ToolRoot,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Release-ComObjectSafe {
    param([object]$Value)
    if ($null -ne $Value -and [Runtime.InteropServices.Marshal]::IsComObject($Value)) {
        try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value) } catch {}
    }
}

function Get-Worksheet {
    param([object]$Workbook, [string]$Name)
    try { return $Workbook.Worksheets.Item($Name) } catch { return $null }
}

function Get-MatrixValue {
    param([object]$Matrix, [int]$Row, [int]$Column)
    if ($null -eq $Matrix) { return $null }
    if ($Matrix -is [Array]) { return $Matrix.GetValue($Row, $Column) }
    if ($Row -eq 1 -and $Column -eq 1) { return $Matrix }
    return $null
}

function Convert-ToIsoDate {
    param([object]$Value)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return '' }
    try {
        if ($Value -is [double] -or $Value -is [int] -or $Value -is [decimal]) {
            return [datetime]::FromOADate([double]$Value).ToString('yyyy-MM-dd')
        }
        return ([datetime]::Parse([string]$Value)).ToString('yyyy-MM-dd')
    }
    catch { return ([string]$Value).Trim() }
}

function Convert-ToIsoTime {
    param([object]$Value)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return '' }
    try {
        if ($Value -is [double] -or $Value -is [int] -or $Value -is [decimal]) {
            return [datetime]::FromOADate([double]$Value).ToString('o')
        }
        return ([datetime]::Parse([string]$Value)).ToString('o')
    }
    catch { return ([string]$Value).Trim() }
}

function Convert-ToNullableNumber {
    param([object]$Value)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $null }
    try { return [double]$Value } catch { return $null }
}

$ToolRoot = [IO.Path]::GetFullPath($ToolRoot)
$workbookPath = Join-Path $ToolRoot '关键词排名每日跟进表.xlsx'
if (-not (Test-Path -LiteralPath $workbookPath)) { throw "找不到跟进表：$workbookPath" }
$outputDirectory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($OutputPath))
if (-not (Test-Path -LiteralPath $outputDirectory)) { [void](New-Item -ItemType Directory -Force -Path $outputDirectory) }

$app = $null
$workbook = $null
$configSheet = $null
$watchSheet = $null
try {
    $app = New-Object -ComObject 'ket.Application'
    $app.Visible = $false
    $app.DisplayAlerts = $false
    $workbook = $app.Workbooks.Open($workbookPath, 0, $true)

    $configSheet = Get-Worksheet $workbook '型号配置'
    if ($null -eq $configSheet) { throw '跟进表缺少“型号配置”Sheet。' }
    $configLastRow = [Math]::Max(5, [int]$configSheet.UsedRange.Rows.Count)
    $configData = $configSheet.Range("A5:I$configLastRow").Value2
    $configs = New-Object System.Collections.Generic.List[object]
    for ($row = 1; $row -le ($configLastRow - 4); $row++) {
        $modelName = ([string](Get-MatrixValue $configData $row 1)).Trim()
        $parentAsin = ([string](Get-MatrixValue $configData $row 2)).Trim().ToUpperInvariant()
        $enabled = ([string](Get-MatrixValue $configData $row 4)).Trim().ToUpperInvariant()
        if ([string]::IsNullOrWhiteSpace($modelName) -or [string]::IsNullOrWhiteSpace($parentAsin) -or $enabled -notin @('是', 'YES', 'TRUE', '1')) { continue }
        $configs.Add([pscustomobject]@{
            modelName = $modelName
            parentAsin = $parentAsin
            site = ([string](Get-MatrixValue $configData $row 3)).Trim()
            dashboardSheet = ([string](Get-MatrixValue $configData $row 5)).Trim()
            historySheet = ([string](Get-MatrixValue $configData $row 6)).Trim()
            naturalMatrixSheet = ([string](Get-MatrixValue $configData $row 7)).Trim()
            spMatrixSheet = ([string](Get-MatrixValue $configData $row 8)).Trim()
            abaMonthlySheet = ([string](Get-MatrixValue $configData $row 9)).Trim()
            order = $configs.Count
        })
    }

    $watchSheet = Get-Worksheet $workbook '关注关键词'
    if ($null -eq $watchSheet) { throw '跟进表缺少“关注关键词”Sheet。' }
    $watchLastRow = [Math]::Max(5, [int]$watchSheet.UsedRange.Rows.Count)
    $watchData = $watchSheet.Range("A5:D$watchLastRow").Value2
    $watches = New-Object System.Collections.Generic.List[object]
    for ($row = 1; $row -le ($watchLastRow - 4); $row++) {
        $modelName = ([string](Get-MatrixValue $watchData $row 1)).Trim()
        $keyword = ([string](Get-MatrixValue $watchData $row 2)).Trim()
        if ([string]::IsNullOrWhiteSpace($modelName) -or [string]::IsNullOrWhiteSpace($keyword)) { continue }
        $enabled = ([string](Get-MatrixValue $watchData $row 4)).Trim().ToUpperInvariant()
        $watches.Add([pscustomobject]@{
            modelName = $modelName
            keyword = $keyword
            note = ([string](Get-MatrixValue $watchData $row 3)).Trim()
            enabled = $enabled -in @('是', 'YES', 'TRUE', '1', '★')
            order = $row - 1
        })
    }

    $histories = [ordered]@{}
    foreach ($config in $configs) {
        $historySheet = Get-Worksheet $workbook $config.historySheet
        if ($null -eq $historySheet) { $histories[$config.historySheet] = @(); continue }
        try {
            $lastRow = [int]$historySheet.UsedRange.Rows.Count
            $records = New-Object System.Collections.Generic.List[object]
            if ($lastRow -ge 2) {
                $data = $historySheet.Range("A2:V$lastRow").Value2
                for ($row = 1; $row -le ($lastRow - 1); $row++) {
                    $snapshotDate = Convert-ToIsoDate (Get-MatrixValue $data $row 1)
                    $keyword = ([string](Get-MatrixValue $data $row 5)).Trim()
                    if ([string]::IsNullOrWhiteSpace($snapshotDate) -or [string]::IsNullOrWhiteSpace($keyword) -or $keyword -eq '等待首次导入') { continue }
                    $records.Add([pscustomobject]@{
                        snapshotDate = $snapshotDate
                        importTime = Convert-ToIsoTime (Get-MatrixValue $data $row 2)
                        modelName = [string](Get-MatrixValue $data $row 3)
                        parentAsin = [string](Get-MatrixValue $data $row 4)
                        keyword = $keyword
                        translation = [string](Get-MatrixValue $data $row 6)
                        keywordType = [string](Get-MatrixValue $data $row 7)
                        trafficRank = Convert-ToNullableNumber (Get-MatrixValue $data $row 8)
                        trafficShare = Convert-ToNullableNumber (Get-MatrixValue $data $row 9)
                        naturalRank = Convert-ToNullableNumber (Get-MatrixValue $data $row 10)
                        naturalRankDate = Convert-ToIsoDate (Get-MatrixValue $data $row 11)
                        naturalChildAsin = [string](Get-MatrixValue $data $row 12)
                        spRank = Convert-ToNullableNumber (Get-MatrixValue $data $row 13)
                        spRankDate = Convert-ToIsoDate (Get-MatrixValue $data $row 14)
                        spCampaign = [string](Get-MatrixValue $data $row 15)
                        spChildAsin = [string](Get-MatrixValue $data $row 16)
                        weeklyAbaRank = Convert-ToNullableNumber (Get-MatrixValue $data $row 17)
                        weeklySearchVolume = Convert-ToNullableNumber (Get-MatrixValue $data $row 18)
                        historyWatched = ([string](Get-MatrixValue $data $row 19)).Trim() -eq '是'
                        status = [string](Get-MatrixValue $data $row 20)
                        sourceFile = [string](Get-MatrixValue $data $row 21)
                        conversionRate = Convert-ToNullableNumber (Get-MatrixValue $data $row 22)
                    })
                }
            }
            $histories[$config.historySheet] = $records.ToArray()
        }
        finally {
            Release-ComObjectSafe $historySheet
        }
    }

    $result = [pscustomobject]@{
        configs = $configs.ToArray()
        watches = $watches.ToArray()
        histories = $histories
    }
    $json = $result | ConvertTo-Json -Depth 8 -Compress
    [IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputPath), $json, [Text.UTF8Encoding]::new($false))
    Write-Host ("已导出软件数据：{0} 个型号，{1} 个关注词。" -f $configs.Count, $watches.Count)
}
finally {
    if ($null -ne $workbook) { try { $workbook.Close($false) } catch {} }
    if ($null -ne $app) { try { $app.Quit() } catch {} }
    Release-ComObjectSafe $watchSheet
    Release-ComObjectSafe $configSheet
    Release-ComObjectSafe $workbook
    Release-ComObjectSafe $app
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
