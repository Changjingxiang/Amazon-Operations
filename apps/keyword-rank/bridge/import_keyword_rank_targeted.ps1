param(
    [switch]$ExtractOnly,
    [string]$SourceFile,
    [string]$WorkbookPath,
    [string]$SourceFolder,
    [switch]$NoPause,
    [switch]$ForceReimport,
    [switch]$RefreshOnly,
    [string]$OnlyAsin,
    [string]$AppAction,
    [string]$AppModelName,
    [string]$AppKeyword,
    [string]$AppKeywordsJson,
    [string]$AppNote,
    [string]$AppEnabled,
    [string]$AppParentAsin,
    [string]$AppSite = '加拿大站点'
)

$ErrorActionPreference = 'Stop'

function Normalize-Header {
    param([object]$Value)
    if ($null -eq $Value) { return '' }
    return (([string]$Value) -replace '[\r\n\t ]+', ' ').Trim()
}

function Convert-ToNullableNumber {
    param([object]$Value)
    if ($null -eq $Value -or ([string]$Value).Trim() -eq '') { return $null }
    $number = 0.0
    if ([double]::TryParse(
        ([string]$Value),
        [Globalization.NumberStyles]::Any,
        [Globalization.CultureInfo]::InvariantCulture,
        [ref]$number
    )) { return $number }
    if ($Value -is [ValueType]) { return [double]$Value }
    return $null
}

function Convert-ToIsoDate {
    param([object]$Value)
    if ($null -eq $Value -or ([string]$Value).Trim() -eq '') { return $null }
    if ($Value -is [datetime]) { return ([datetime]$Value).ToString('yyyy-MM-dd') }
    if ($Value -is [double] -or $Value -is [int]) {
        try { return [datetime]::FromOADate([double]$Value).ToString('yyyy-MM-dd') } catch {}
    }
    $text = ([string]$Value).Trim()
    $m = [regex]::Match($text, '(\d{4})[-/](\d{1,2})[-/](\d{1,2})')
    if ($m.Success) {
        return ('{0:D4}-{1:D2}-{2:D2}' -f [int]$m.Groups[1].Value, [int]$m.Groups[2].Value, [int]$m.Groups[3].Value)
    }
    return $null
}

function Convert-IsoToOADate {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    return [datetime]::ParseExact($Value, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture).ToOADate()
}

function Convert-ToComScalar {
    param([object]$Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [datetime]) { return ([datetime]$Value).ToOADate() }
    if ($Value -is [string]) { return [string]::Concat('', [string]$Value) }
    if ($Value -is [bool]) { return [bool]$Value }
    if (
        $Value -is [byte] -or $Value -is [int16] -or $Value -is [int32] -or
        $Value -is [int64] -or $Value -is [single] -or $Value -is [double] -or
        $Value -is [decimal]
    ) { return [double]$Value }
    return [string]$Value
}

function Get-OleColor {
    param([string]$Hex)
    $h = $Hex.TrimStart('#')
    $r = [Convert]::ToInt32($h.Substring(0, 2), 16)
    $g = [Convert]::ToInt32($h.Substring(2, 2), 16)
    $b = [Convert]::ToInt32($h.Substring(4, 2), 16)
    return $r + ($g * 256) + ($b * 65536)
}

function Release-ComObjectSafe {
    param([object]$Object)
    if ($null -ne $Object -and [Runtime.InteropServices.Marshal]::IsComObject($Object)) {
        try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($Object) } catch {}
    }
}

function Test-FileInUse {
    param([string]$Path)
    $stream = $null
    try {
        $stream = [IO.File]::Open(
            $Path,
            [IO.FileMode]::Open,
            [IO.FileAccess]::ReadWrite,
            [IO.FileShare]::None
        )
        return $false
    }
    catch {
        return $true
    }
    finally {
        if ($null -ne $stream) { $stream.Dispose() }
    }
}

function Get-Worksheet {
    param([object]$Workbook, [string]$Name)
    try { return $Workbook.Worksheets.Item($Name) } catch { return $null }
}

function Test-WorksheetExists {
    param([object]$Workbook, [string]$Name)
    if ([string]::IsNullOrWhiteSpace($Name)) { return $false }
    $sheet = Get-Worksheet $Workbook $Name
    if ($null -eq $sheet) { return $false }
    Release-ComObjectSafe $sheet
    return $true
}

function Get-ModelSheetPrefix {
    param(
        [string]$ModelName,
        [string]$ParentAsin
    )
    $prefix = ''
    $match = [regex]::Match($ModelName, '(?i)M([A-Z0-9]{3,10})')
    if ($match.Success) {
        $prefix = $match.Groups[1].Value.ToUpperInvariant()
    }
    elseif (-not [string]::IsNullOrWhiteSpace($ParentAsin)) {
        $length = [Math]::Min(6, $ParentAsin.Length)
        $prefix = $ParentAsin.Substring($ParentAsin.Length - $length).ToUpperInvariant()
    }
    $prefix = ($prefix -replace '[\\/\?\*\[\]:]', '').Trim()
    if ([string]::IsNullOrWhiteSpace($prefix)) { $prefix = '型号' }
    return $prefix
}

function Get-UniqueWorksheetName {
    param(
        [object]$Workbook,
        [string]$BaseName,
        [hashtable]$ReservedNames
    )
    $clean = (($BaseName -replace '[\\/\?\*\[\]:]', '_').Trim().Trim("'"))
    if ([string]::IsNullOrWhiteSpace($clean)) { $clean = '型号Sheet' }
    if ($clean.Length -gt 31) { $clean = $clean.Substring(0, 31) }
    $candidate = $clean
    $counter = 2
    while ($ReservedNames.ContainsKey($candidate.ToLowerInvariant()) -or (Test-WorksheetExists $Workbook $candidate)) {
        $suffix = "_$counter"
        $baseLength = [Math]::Min($clean.Length, 31 - $suffix.Length)
        $candidate = $clean.Substring(0, $baseLength) + $suffix
        $counter++
    }
    return $candidate
}

function Copy-WorksheetTemplate {
    param(
        [object]$Workbook,
        [string]$TemplateName,
        [string]$NewName
    )
    $templateSheet = Get-Worksheet $Workbook $TemplateName
    if ($null -eq $templateSheet) { throw "找不到可复制的模板Sheet：$TemplateName" }
    $anchorSheet = Get-Worksheet $Workbook '导入日志'
    if ($null -eq $anchorSheet) {
        Release-ComObjectSafe $templateSheet
        throw '跟进表缺少“导入日志”Sheet，无法插入新型号Sheet。'
    }
    $newSheet = $null
    $originalVisibility = $templateSheet.Visible
    try {
        if ($originalVisibility -ne -1) { $templateSheet.Visible = -1 }
        $templateSheet.Copy($anchorSheet)
        $newSheet = $Workbook.Worksheets.Item($anchorSheet.Index - 1)
        $newSheet.Name = $NewName
        return $newSheet
    }
    finally {
        try { $templateSheet.Visible = $originalVisibility } catch {}
        Release-ComObjectSafe $anchorSheet
        Release-ComObjectSafe $templateSheet
    }
}

function Create-BlankWorksheet {
    param(
        [object]$Workbook,
        [string]$NewName
    )
    $anchorSheet = Get-Worksheet $Workbook '导入日志'
    if ($null -eq $anchorSheet) { throw '跟进表缺少“导入日志”Sheet，无法插入新型号Sheet。' }
    $newSheet = $null
    try {
        $newSheet = $Workbook.Worksheets.Add($anchorSheet)
        $newSheet.Name = $NewName
        return $newSheet
    }
    finally { Release-ComObjectSafe $anchorSheet }
}

function Initialize-GeneratedWorksheet {
    param(
        [object]$Sheet,
        [ValidateSet('Dashboard', 'History', 'NaturalMatrix', 'SPMatrix', 'ABAMonthly')]
        [string]$Role,
        [string]$ModelName,
        [string]$ParentAsin
    )
    if ($Role -eq 'History') {
        $usedRows = [Math]::Max(2, [int]$Sheet.UsedRange.Rows.Count)
        [void]$Sheet.Range("A2:V$usedRows").ClearContents()
        $Sheet.Visible = 0
        return
    }

    if ($Role -eq 'Dashboard') {
        [void]$Sheet.Range('A10:R309').ClearContents()
        [void]$Sheet.Range('T8:CE366').ClearContents()
        try { $Sheet.Range('A10:B309').SparklineGroups.Clear() } catch {}
        $Sheet.Cells.Item(1, 1).Value2 = [string]("$ModelName｜关键词排名每日跟进")
        $Sheet.Cells.Item(3, 2).Value2 = [string]$ModelName
        $Sheet.Cells.Item(3, 5).Value2 = [string]$ParentAsin
        [void]$Sheet.Range('H3').ClearContents()
        foreach ($cell in @('B5', 'E5', 'H5', 'K5')) { $Sheet.Range($cell).Value2 = 0 }
        $Sheet.Range('N5').Value2 = '关注词置顶 + 完整流量前100'
        $Sheet.Visible = -1
        return
    }

    if ($Role -eq 'ABAMonthly') {
        [void]$Sheet.Cells.Clear()
        $Sheet.Cells.Item(1, 1).Value2 = [string]("$ModelName｜ABA月度排名")
        $Sheet.Visible = -1
        return
    }

    $usedRows = [Math]::Max(5, [int]$Sheet.UsedRange.Rows.Count)
    $usedCols = [Math]::Max(4, [int]$Sheet.UsedRange.Columns.Count)
    $lastColumnLetter = Get-ColumnLetter $usedCols
    [void]$Sheet.Range("A5:$lastColumnLetter$usedRows").ClearContents()
    [void]$Sheet.Range("D4:$lastColumnLetter" + '4').ClearContents()
    $label = if ($Role -eq 'NaturalMatrix') { '自然排名' } else { 'SP排名' }
    $Sheet.Cells.Item(1, 1).Value2 = [string]("$ModelName｜${label}每日跟进矩阵")
    $Sheet.Visible = -1
}

function Update-AutoModelInstructions {
    param([object]$Workbook)
    $configSheet = Get-Worksheet $Workbook '型号配置'
    if ($null -ne $configSheet) {
        try {
            $configSheet.Range('A2').Value2 = '新增型号只需填写 A-D 列：型号名称、父体ASIN、站点、启用=是；运行任一工具后，E-I列及五张Sheet自动生成。'
        }
        finally { Release-ComObjectSafe $configSheet }
    }
    $usageSheet = Get-Worksheet $Workbook '使用说明'
    if ($null -ne $usageSheet) {
        try {
            $usageSheet.Range('C8').Value2 = '导入完成后从“型号导航”进入对应产品的自然矩阵、SP矩阵、ABA月度或看板。'
            $usageSheet.Range('C9').Value2 = '只改星标或查看年份时，可运行“仅刷新看板和矩阵.cmd”；三个工具都会先同步星标。'
            $usageSheet.Range('C10').Value2 = '在自然矩阵、SP矩阵或看板的关注列选择 ☆/★；运行任一工具后，三张表同步并按关注词置顶。'
            $usageSheet.Range('C11').Value2 = '在“型号配置”新增一行，只填写型号名称、父体ASIN、站点和“启用=是”；下次运行任一工具时自动生成看板、历史、自然矩阵、SP矩阵和ABA月度。'
            try { [void]$usageSheet.Range('A11:C11').Copy($usageSheet.Range('A12:C12')) } catch {}
            $usageSheet.Range('A12').Value2 = 7
            $usageSheet.Range('B12').Value2 = 'ABA月度'
            $usageSheet.Range('C12').Value2 = '选择年份查看1至12月ABA；每月取当月最后一次有效排名，搜索量与点击转化率取当年最高值。'
        }
        finally { Release-ComObjectSafe $usageSheet }
    }
}

function Ensure-ModelWorksheets {
    param([object]$Workbook)
    $configSheet = Get-Worksheet $Workbook '型号配置'
    if ($null -eq $configSheet) { throw '跟进表缺少“型号配置”Sheet。' }
    try {
        $configSheet.Cells.Item(4, 9).Value2 = 'ABA月度Sheet'
        $configSheet.Columns.Item(9).ColumnWidth = 20
        $lastRow = [Math]::Max(100, [int]$configSheet.UsedRange.Rows.Count)
        $rows = New-Object System.Collections.Generic.List[object]
        for ($row = 5; $row -le $lastRow; $row++) {
            $modelName = ([string]$configSheet.Cells.Item($row, 1).Value2).Trim()
            $parentAsin = ([string]$configSheet.Cells.Item($row, 2).Value2).Trim().ToUpperInvariant()
            $enabled = ([string]$configSheet.Cells.Item($row, 4).Value2).Trim()
            if ([string]::IsNullOrWhiteSpace($modelName) -or [string]::IsNullOrWhiteSpace($parentAsin)) { continue }
            if ($enabled -notin @('是', 'TRUE', 'True', 'true', '1')) { continue }
            if ($parentAsin -notmatch '^B[A-Z0-9]{9}$') {
                throw "型号配置第 $row 行的父体ASIN格式不正确：$parentAsin"
            }
            $rows.Add([pscustomobject]@{
                Row = $row
                ModelName = $modelName
                ParentAsin = $parentAsin
                DashboardSheet = ([string]$configSheet.Cells.Item($row, 5).Value2).Trim()
                HistorySheet = ([string]$configSheet.Cells.Item($row, 6).Value2).Trim()
                NaturalMatrixSheet = ([string]$configSheet.Cells.Item($row, 7).Value2).Trim()
                SPMatrixSheet = ([string]$configSheet.Cells.Item($row, 8).Value2).Trim()
                ABAMonthlySheet = ([string]$configSheet.Cells.Item($row, 9).Value2).Trim()
            })
        }
        if ($rows.Count -eq 0) { return 0 }

        $template = $rows | Where-Object {
            (Test-WorksheetExists $Workbook $_.DashboardSheet) -and
            (Test-WorksheetExists $Workbook $_.HistorySheet) -and
            (Test-WorksheetExists $Workbook $_.NaturalMatrixSheet) -and
            (Test-WorksheetExists $Workbook $_.SPMatrixSheet)
        } | Select-Object -First 1
        if ($null -eq $template) {
            throw '没有找到一套完整的现有型号Sheet作为自动生成模板。'
        }

        $roleInfo = @(
            [pscustomobject]@{ Property = 'DashboardSheet'; Column = 5; Suffix = '_看板'; Role = 'Dashboard'; TemplateProperty = 'DashboardSheet' },
            [pscustomobject]@{ Property = 'HistorySheet'; Column = 6; Suffix = '_历史'; Role = 'History'; TemplateProperty = 'HistorySheet' },
            [pscustomobject]@{ Property = 'NaturalMatrixSheet'; Column = 7; Suffix = '_自然矩阵'; Role = 'NaturalMatrix'; TemplateProperty = 'NaturalMatrixSheet' },
            [pscustomobject]@{ Property = 'SPMatrixSheet'; Column = 8; Suffix = '_SP矩阵'; Role = 'SPMatrix'; TemplateProperty = 'SPMatrixSheet' },
            [pscustomobject]@{ Property = 'ABAMonthlySheet'; Column = 9; Suffix = '_ABA月度'; Role = 'ABAMonthly'; TemplateProperty = '' }
        )
        $reservedNames = @{}
        $createdSheets = 0

        foreach ($rowConfig in $rows) {
            $prefix = Get-ModelSheetPrefix $rowConfig.ModelName $rowConfig.ParentAsin
            foreach ($role in $roleInfo) {
                $sheetName = [string]$rowConfig.($role.Property)
                $nameKey = if ([string]::IsNullOrWhiteSpace($sheetName)) { '' } else { $sheetName.ToLowerInvariant() }
                if ([string]::IsNullOrWhiteSpace($sheetName) -or $reservedNames.ContainsKey($nameKey)) {
                    $sheetName = Get-UniqueWorksheetName $Workbook ($prefix + $role.Suffix) $reservedNames
                    $configSheet.Cells.Item($rowConfig.Row, $role.Column).Value2 = [string]$sheetName
                    $rowConfig.($role.Property) = $sheetName
                    $nameKey = $sheetName.ToLowerInvariant()
                }
                $reservedNames[$nameKey] = $rowConfig.ParentAsin

                if (-not (Test-WorksheetExists $Workbook $sheetName)) {
                    $newSheet = if ($role.Role -eq 'ABAMonthly') {
                        Create-BlankWorksheet $Workbook $sheetName
                    }
                    else {
                        $templateName = [string]$template.($role.TemplateProperty)
                        Copy-WorksheetTemplate $Workbook $templateName $sheetName
                    }
                    try {
                        Initialize-GeneratedWorksheet $newSheet $role.Role $rowConfig.ModelName $rowConfig.ParentAsin
                        Write-Host ("    已自动生成：{0}" -f $sheetName)
                        $createdSheets++
                    }
                    finally { Release-ComObjectSafe $newSheet }
                }
            }
        }
        Update-AutoModelInstructions $Workbook
        return $createdSheets
    }
    finally { Release-ComObjectSafe $configSheet }
}

function Get-CellValue {
    param([object[,]]$Data, [int]$Row, [int]$Column)
    try { return $Data[$Row, $Column] } catch { return $null }
}

function New-ObjectMatrix {
    param([int]$Rows, [int]$Columns)
    return ,(New-Object 'object[,]' -ArgumentList $Rows, $Columns)
}

function Read-SourceReport {
    param(
        [object]$Application,
        [string]$Path
    )

    $book = $null
    $sheet = $null
    $used = $null
    try {
        $book = $Application.Workbooks.Open($Path, 0, $true)
        if ($book.Worksheets.Count -lt 1) { throw '源报表没有工作表。' }
        $sheet = $book.Worksheets.Item(1)
        $used = $sheet.UsedRange
        $rowCount = [int]$used.Rows.Count
        $columnCount = [int]$used.Columns.Count
        if ($rowCount -lt 3 -or $columnCount -lt 2) { throw '源报表没有可用数据行。' }

        $metaText = [string]$sheet.Cells.Item(1, 1).Value2
        $sheetName = [string]$sheet.Name
        $asinMatch = [regex]::Match($metaText, 'ASIN\((B[A-Z0-9]{9})\)', 'IgnoreCase')
        if (-not $asinMatch.Success) {
            $asinMatch = [regex]::Match($sheetName, '(B[A-Z0-9]{9})', 'IgnoreCase')
        }
        if (-not $asinMatch.Success) { throw '无法从首行或Sheet名称识别父体ASIN。' }
        $parentAsin = $asinMatch.Groups[1].Value.ToUpperInvariant()

        $dateMatch = [regex]::Match($metaText, '导出时间\s*:\s*(\d{4}-\d{2}-\d{2})')
        if (-not $dateMatch.Success) { throw '无法从首行识别导出日期。' }
        $snapshotDate = $dateMatch.Groups[1].Value

        $site = ''
        if ($sheetName.Contains('_')) { $site = $sheetName.Split('_')[0] }

        $headerValues = $sheet.Range(
            $sheet.Cells.Item(2, 1),
            $sheet.Cells.Item(2, $columnCount)
        ).Value2
        $headers = @{}
        for ($c = 1; $c -le $columnCount; $c++) {
            $name = Normalize-Header (Get-CellValue $headerValues 1 $c)
            if (-not [string]::IsNullOrWhiteSpace($name)) { $headers[$name] = $c }
        }

        $required = @(
            '关键词',
            '该关键词给父体贡献的 全部流量占比',
            '自然排名',
            '自然排名时间',
            'SP(常规)排名',
            'SP(常规)排名时间',
            '周ABA排名',
            '周搜索量'
        )
        $missing = @($required | Where-Object { -not $headers.ContainsKey($_) })
        if ($missing.Count -gt 0) {
            throw ('缺少必需字段：' + ($missing -join '、'))
        }

        $data = $sheet.Range(
            $sheet.Cells.Item(3, 1),
            $sheet.Cells.Item($rowCount, $columnCount)
        ).Value2

        function Source-Value([int]$dataRow, [string]$headerName) {
            if (-not $headers.ContainsKey($headerName)) { return $null }
            return Get-CellValue $data $dataRow ([int]$headers[$headerName])
        }

        $records = New-Object System.Collections.Generic.List[object]
        for ($r = 1; $r -le ($rowCount - 2); $r++) {
            $keyword = ([string](Source-Value $r '关键词')).Trim()
            if ([string]::IsNullOrWhiteSpace($keyword)) { continue }
            $records.Add([pscustomobject]@{
                Keyword            = $keyword
                Translation        = [string](Source-Value $r '翻译')
                KeywordType        = [string](Source-Value $r '关键词效果类型')
                TrafficShare       = Convert-ToNullableNumber (Source-Value $r '该关键词给父体贡献的 全部流量占比')
                NaturalRank        = Convert-ToNullableNumber (Source-Value $r '自然排名')
                NaturalRankDate    = Convert-ToIsoDate (Source-Value $r '自然排名时间')
                NaturalChildAsin   = [string](Source-Value $r '最新自然排名 对应的子体')
                SPRank             = Convert-ToNullableNumber (Source-Value $r 'SP(常规)排名')
                SPRankDate         = Convert-ToIsoDate (Source-Value $r 'SP(常规)排名时间')
                SPCampaign         = [string](Source-Value $r 'SP(常规)排名 对应的广告活动')
                SPChildAsin        = [string](Source-Value $r '最新SP(常规)排名 对应的子体')
                WeeklyABARank      = Convert-ToNullableNumber (Source-Value $r '周ABA排名')
                WeeklySearchVolume = Convert-ToNullableNumber (Source-Value $r '周搜索量')
                ClickConversionRate = Convert-ToNullableNumber (Source-Value $r '关键词点击转化率')
                IsWatched          = $false
                Status             = '正常'
            })
        }

        $sorted = @($records | Sort-Object -Property @{
            Expression = {
                if ($null -eq $_.TrafficShare) { [double]::NegativeInfinity } else { [double]$_.TrafficShare }
            }
            Descending = $true
        }, @{ Expression = { $_.Keyword }; Descending = $false })
        for ($i = 0; $i -lt $sorted.Count; $i++) {
            $sorted[$i] | Add-Member -NotePropertyName TrafficRank -NotePropertyValue ($i + 1) -Force
        }

        return [pscustomobject]@{
            SourceFile   = [IO.Path]::GetFileName($Path)
            SourcePath   = $Path
            ParentAsin   = $parentAsin
            ModelName    = $parentAsin
            Site         = $site
            SnapshotDate = $snapshotDate
            Records      = $sorted
        }
    }
    finally {
        if ($null -ne $book) { try { $book.Close($false) } catch {} }
        Release-ComObjectSafe $used
        Release-ComObjectSafe $sheet
        Release-ComObjectSafe $book
    }
}

function Get-ModelConfigs {
    param([object]$Workbook)
    $sheet = Get-Worksheet $Workbook '型号配置'
    if ($null -eq $sheet) { throw '跟进表缺少“型号配置”Sheet。' }
    try {
        $lastRow = [Math]::Max(5, [int]$sheet.UsedRange.Rows.Count)
        $data = $sheet.Range("A5:I$lastRow").Value2
        $items = New-Object System.Collections.Generic.List[object]
        for ($r = 1; $r -le ($lastRow - 4); $r++) {
            $model = ([string](Get-CellValue $data $r 1)).Trim()
            $asin = ([string](Get-CellValue $data $r 2)).Trim().ToUpperInvariant()
            $enabled = ([string](Get-CellValue $data $r 4)).Trim()
            if ([string]::IsNullOrWhiteSpace($model) -or [string]::IsNullOrWhiteSpace($asin)) { continue }
            if ($enabled -notin @('是', 'TRUE', 'True', 'true', '1')) { continue }
            $items.Add([pscustomobject]@{
                ModelName    = $model
                ParentAsin   = $asin
                Site         = [string](Get-CellValue $data $r 3)
                DashboardSheet = [string](Get-CellValue $data $r 5)
                HistorySheet = [string](Get-CellValue $data $r 6)
                NaturalMatrixSheet = [string](Get-CellValue $data $r 7)
                SPMatrixSheet = [string](Get-CellValue $data $r 8)
                ABAMonthlySheet = [string](Get-CellValue $data $r 9)
            })
        }
        return $items.ToArray()
    }
    finally { Release-ComObjectSafe $sheet }
}

function Get-WatchEntries {
    param([object]$Workbook)
    $sheet = Get-Worksheet $Workbook '关注关键词'
    if ($null -eq $sheet) { return @() }
    try {
        $lastRow = [Math]::Max(5, [int]$sheet.UsedRange.Rows.Count)
        $data = $sheet.Range("A5:D$lastRow").Value2
        $items = New-Object System.Collections.Generic.List[object]
        for ($r = 1; $r -le ($lastRow - 4); $r++) {
            $model = ([string](Get-CellValue $data $r 1)).Trim()
            $keyword = ([string](Get-CellValue $data $r 2)).Trim()
            $enabled = ([string](Get-CellValue $data $r 4)).Trim()
            if ([string]::IsNullOrWhiteSpace($model) -or [string]::IsNullOrWhiteSpace($keyword)) { continue }
            if ($enabled -notin @('是', 'TRUE', 'True', 'true', '1')) { continue }
            $items.Add([pscustomobject]@{
                ModelName = $model
                Keyword   = $keyword
                Note      = [string](Get-CellValue $data $r 3)
                Order     = $r
            })
        }
        return $items.ToArray()
    }
    finally { Release-ComObjectSafe $sheet }
}

function Get-WatchesForConfig {
    param(
        [object[]]$WatchEntries,
        [object]$Config
    )
    return @($WatchEntries | Where-Object {
        $_.ModelName -eq $Config.ModelName -or $_.ModelName -eq $Config.ParentAsin
    })
}

function Get-ViewStarStates {
    param(
        [object]$Sheet,
        [int]$HeaderRow
    )
    $states = @{}
    if ($null -eq $Sheet) { return $states }
    $usedCols = [Math]::Min(100, [Math]::Max(3, [int]$Sheet.UsedRange.Columns.Count))
    $keywordColumn = 0
    $watchColumn = 0
    for ($column = 1; $column -le $usedCols; $column++) {
        $header = (Normalize-Header $Sheet.Cells.Item($HeaderRow, $column).Value2)
        if ($header -eq '关键词') { $keywordColumn = $column }
        elseif ($header -eq '关注' -or $header -like '关注（*') { $watchColumn = $column }
    }
    if ($keywordColumn -eq 0 -or $watchColumn -eq 0) { return $states }
    $lastRow = [int]$Sheet.Cells.Item($Sheet.Rows.Count, $keywordColumn).End(-4162).Row
    for ($row = $HeaderRow + 1; $row -le $lastRow; $row++) {
        $keyword = ([string]$Sheet.Cells.Item($row, $keywordColumn).Value2).Trim()
        if ([string]::IsNullOrWhiteSpace($keyword)) { continue }
        $star = ([string]$Sheet.Cells.Item($row, $watchColumn).Value2).Trim()
        $states[$keyword.ToLowerInvariant()] = [pscustomobject]@{
            Keyword = $keyword
            Watched = ($star -eq '★' -or $star -in @('是', 'TRUE', 'True', 'true', '1'))
        }
    }
    return $states
}

function Set-WatchEntryState {
    param(
        [object]$WatchSheet,
        [object]$Config,
        [string]$Keyword,
        [bool]$Watched
    )
    $lastRow = [Math]::Max(5, [int]$WatchSheet.Cells.Item($WatchSheet.Rows.Count, 2).End(-4162).Row)
    $matchedRow = 0
    for ($row = 5; $row -le $lastRow; $row++) {
        $modelKey = ([string]$WatchSheet.Cells.Item($row, 1).Value2).Trim()
        $existingKeyword = ([string]$WatchSheet.Cells.Item($row, 2).Value2).Trim()
        if (($modelKey -eq $Config.ModelName -or $modelKey.ToUpperInvariant() -eq $Config.ParentAsin) -and
            $existingKeyword.ToLowerInvariant() -eq $Keyword.ToLowerInvariant()) {
            $matchedRow = $row
            break
        }
    }
    if ($matchedRow -eq 0) {
        if (-not $Watched) { return }
        $matchedRow = [Math]::Max(5, $lastRow + 1)
        $WatchSheet.Cells.Item($matchedRow, 1).Value2 = [string]$Config.ModelName
        $WatchSheet.Cells.Item($matchedRow, 2).Value2 = [string]$Keyword
    }
    $stateText = if ($Watched) { '是' } else { '否' }
    $WatchSheet.Cells.Item($matchedRow, 4).Value2 = [string]$stateText
}

function Reorder-WatchEntries {
    param(
        [object]$WatchSheet,
        [object]$Config,
        [string[]]$Keywords
    )
    $lastRow = [Math]::Max(5, [int]$WatchSheet.Cells.Item($WatchSheet.Rows.Count, 2).End(-4162).Row)
    $rows = New-Object System.Collections.Generic.List[object]
    for ($row = 5; $row -le $lastRow; $row++) {
        $modelKey = ([string]$WatchSheet.Cells.Item($row, 1).Value2).Trim()
        $keyword = ([string]$WatchSheet.Cells.Item($row, 2).Value2).Trim()
        if ([string]::IsNullOrWhiteSpace($keyword)) { continue }
        if ($modelKey -eq $Config.ModelName -or $modelKey.ToUpperInvariant() -eq $Config.ParentAsin) {
            $rows.Add([pscustomobject]@{
                Row = $row
                Key = $keyword.ToLowerInvariant()
                Values = @(
                    [string]$WatchSheet.Cells.Item($row, 1).Value2,
                    [string]$WatchSheet.Cells.Item($row, 2).Value2,
                    [string]$WatchSheet.Cells.Item($row, 3).Value2,
                    [string]$WatchSheet.Cells.Item($row, 4).Value2
                )
            })
        }
    }
    if ($rows.Count -lt 2) { return }
    $ordered = New-Object System.Collections.Generic.List[object]
    $used = @{}
    foreach ($keyword in $Keywords) {
        $key = ([string]$keyword).Trim().ToLowerInvariant()
        if ([string]::IsNullOrWhiteSpace($key) -or $used.ContainsKey($key)) { continue }
        $match = $rows | Where-Object { $_.Key -eq $key -and -not $used.ContainsKey($_.Key) } | Select-Object -First 1
        if ($null -ne $match) {
            $ordered.Add($match)
            $used[$key] = $true
        }
    }
    foreach ($entry in $rows) {
        if (-not $used.ContainsKey($entry.Key)) {
            $ordered.Add($entry)
            $used[$entry.Key] = $true
        }
    }
    for ($index = 0; $index -lt $rows.Count; $index++) {
        $targetRow = $rows[$index].Row
        $values = $ordered[$index].Values
        for ($column = 1; $column -le 4; $column++) {
            $WatchSheet.Cells.Item($targetRow, $column).Value2 = [string]$values[$column - 1]
        }
    }
    Write-Host ("已调整关注词顺序：{0} / {1}" -f $Config.ModelName, (($ordered | ForEach-Object { $_.Values[1] }) -join '、'))
}

function Sync-WatchEntriesFromViews {
    param(
        [object]$Workbook,
        [object[]]$Configs
    )
    $watchSheet = Get-Worksheet $Workbook '关注关键词'
    if ($null -eq $watchSheet) { throw '跟进表缺少“关注关键词”Sheet。' }
    $changedAsins = @{}
    $changeCount = 0
    try {
        $masterEntries = @(Get-WatchEntries $Workbook)
        foreach ($config in $Configs) {
            $masterSet = @{}
            foreach ($watch in (Get-WatchesForConfig $masterEntries $config)) {
                $masterSet[$watch.Keyword.ToLowerInvariant()] = $true
            }
            $requested = @{}
            foreach ($view in @(
                [pscustomobject]@{ Name = $config.NaturalMatrixSheet; HeaderRow = 4 },
                [pscustomobject]@{ Name = $config.SPMatrixSheet; HeaderRow = 4 },
                [pscustomobject]@{ Name = $config.DashboardSheet; HeaderRow = 9 }
            )) {
                $sheet = Get-Worksheet $Workbook $view.Name
                if ($null -eq $sheet) { continue }
                try {
                    $states = Get-ViewStarStates $sheet $view.HeaderRow
                    foreach ($key in $states.Keys) {
                        $masterWatched = $masterSet.ContainsKey($key)
                        $viewState = $states[$key]
                        if ($viewState.Watched -ne $masterWatched) { $requested[$key] = $viewState }
                    }
                }
                finally { Release-ComObjectSafe $sheet }
            }
            foreach ($key in $requested.Keys) {
                $change = $requested[$key]
                Set-WatchEntryState $watchSheet $config $change.Keyword $change.Watched
                $changeCount++
                $changedAsins[$config.ParentAsin.ToUpperInvariant()] = $true
                $verb = if ($change.Watched) { '关注' } else { '取消关注' }
                Write-Host ("    星标同步：{0}｜{1}｜{2}" -f $config.ModelName, $change.Keyword, $verb)
            }
        }
        return [pscustomobject]@{ Count = $changeCount; ChangedAsins = $changedAsins }
    }
    finally { Release-ComObjectSafe $watchSheet }
}

function Apply-StarValidation {
    param([object]$Range)
    try { $Range.Validation.Delete() } catch {}
    try {
        $Range.Validation.Add(3, 1, 1, '☆,★')
        $Range.Validation.IgnoreBlank = $true
        $Range.Validation.InCellDropdown = $true
    } catch {}
    $Range.HorizontalAlignment = -4108
    $Range.Font.Size = 14
}

function Get-WatchBackfillRequests {
    param(
        [object]$Workbook,
        [object[]]$Configs,
        [object[]]$WatchEntries
    )
    $requests = New-Object System.Collections.Generic.List[object]
    foreach ($config in $Configs) {
        $modelWatches = @(Get-WatchesForConfig $WatchEntries $config)
        if ($modelWatches.Count -eq 0) { continue }
        $historySheet = Get-Worksheet $Workbook $config.HistorySheet
        if ($null -eq $historySheet) { continue }
        try {
            $history = @(Read-History $historySheet)
            $latestDate = ''
            $latestKeys = @{}
            if ($history.Count -gt 0) {
                $latestDate = @($history | Select-Object -ExpandProperty SnapshotDate -Unique | Sort-Object)[-1]
                foreach ($record in ($history | Where-Object { $_.SnapshotDate -eq $latestDate })) {
                    $latestKeys[$record.Keyword.ToLowerInvariant()] = $true
                }
            }
            $missingKeywords = @($modelWatches | Where-Object {
                -not $latestKeys.ContainsKey($_.Keyword.ToLowerInvariant())
            } | Sort-Object Order | Select-Object -ExpandProperty Keyword)
            if ($missingKeywords.Count -gt 0) {
                $requests.Add([pscustomobject]@{
                    Config = $config
                    LatestDate = $latestDate
                    Keywords = $missingKeywords
                })
            }
        }
        finally { Release-ComObjectSafe $historySheet }
    }
    return $requests.ToArray()
}

function Get-LatestSourceFileForAsin {
    param(
        [object[]]$Files,
        [string]$ParentAsin
    )
    return @($Files | Where-Object {
        $_.Name.ToUpperInvariant().Contains($ParentAsin.ToUpperInvariant())
    } | Sort-Object LastWriteTime, Name -Descending | Select-Object -First 1)
}

function Select-TrackedRecords {
    param(
        [object]$Report,
        [object]$Config,
        [object[]]$WatchEntries
    )
    $modelWatches = @(Get-WatchesForConfig $WatchEntries $Config)
    $watchMap = @{}
    foreach ($watch in $modelWatches) { $watchMap[$watch.Keyword.ToLowerInvariant()] = $watch }

    $selected = New-Object System.Collections.Generic.List[object]
    $seen = @{}

    foreach ($watch in ($modelWatches | Sort-Object Order)) {
        $key = $watch.Keyword.ToLowerInvariant()
        $found = $Report.Records | Where-Object { $_.Keyword.ToLowerInvariant() -eq $key } | Select-Object -First 1
        if ($null -ne $found) {
            $copy = $found.PSObject.Copy()
            $copy.IsWatched = $true
            $selected.Add($copy)
        }
        else {
            $selected.Add([pscustomobject]@{
                Keyword = $watch.Keyword; Translation = ''; KeywordType = ''; TrafficRank = $null
                TrafficShare = $null; NaturalRank = $null; NaturalRankDate = $null; NaturalChildAsin = ''
                SPRank = $null; SPRankDate = $null; SPCampaign = ''; SPChildAsin = ''
                WeeklyABARank = $null; WeeklySearchVolume = $null; ClickConversionRate = $null; IsWatched = $true
                Status = '本日报表未出现'
            })
        }
        $seen[$key] = $true
    }

    foreach ($record in ($Report.Records | Select-Object -First 100)) {
        $key = $record.Keyword.ToLowerInvariant()
        if ($seen.ContainsKey($key)) { continue }
        $copy = $record.PSObject.Copy()
        $copy.IsWatched = $watchMap.ContainsKey($key)
        $selected.Add($copy)
        $seen[$key] = $true
    }
    return $selected.ToArray()
}

function Remove-ExistingSnapshot {
    param([object]$Sheet, [string]$ParentAsin, [string]$SnapshotDate)
    $lastRow = [int]$Sheet.UsedRange.Rows.Count
    if ($lastRow -lt 2) { return }
    $data = $Sheet.Range("A2:D$lastRow").Value2
    for ($r = $lastRow - 1; $r -ge 1; $r--) {
        $date = Convert-ToIsoDate (Get-CellValue $data $r 1)
        $asin = ([string](Get-CellValue $data $r 4)).Trim().ToUpperInvariant()
        if ($date -eq $SnapshotDate -and $asin -eq $ParentAsin) {
            $Sheet.Rows.Item($r + 1).Delete()
        }
    }
}

function Ensure-HistorySchema {
    param([object]$Sheet)
    if (([string]$Sheet.Cells.Item(1, 22).Value2).Trim() -ne '关键词点击转化率') {
        try { [void]$Sheet.Cells.Item(1, 21).Copy($Sheet.Cells.Item(1, 22)) } catch {}
        $Sheet.Cells.Item(1, 22).Value2 = '关键词点击转化率'
    }
    $Sheet.Columns.Item(22).ColumnWidth = 16
    $Sheet.Columns.Item(22).NumberFormat = '0.00%'
}

function Write-HistoryRows {
    param(
        [object]$Sheet,
        [object]$Report,
        [object]$Config,
        [object[]]$Records
    )
    $originalLastRow = [Math]::Max(1, [int]$Sheet.UsedRange.Rows.Count)
    $matchingRows = New-Object 'System.Collections.Generic.List[int]'
    $blankRows = New-Object 'System.Collections.Generic.List[int]'
    if ($originalLastRow -ge 2) {
        $existing = $Sheet.Range("A2:V$originalLastRow").Value2
        for ($rowIndex = 1; $rowIndex -le ($originalLastRow - 1); $rowIndex++) {
            $excelRow = $rowIndex + 1
            $oldDate = Convert-ToIsoDate (Get-CellValue $existing $rowIndex 1)
            $oldAsin = ([string](Get-CellValue $existing $rowIndex 4)).Trim().ToUpperInvariant()
            $oldKeyword = ([string](Get-CellValue $existing $rowIndex 5)).Trim()
            if ($oldKeyword -eq '等待首次导入' -or [string]::IsNullOrWhiteSpace($oldKeyword)) {
                $blankRows.Add($excelRow)
            }
            elseif ($oldDate -eq $Report.SnapshotDate -and $oldAsin -eq $Report.ParentAsin) {
                $matchingRows.Add($excelRow)
            }
        }
    }

    $targetRows = New-Object 'System.Collections.Generic.List[int]'
    foreach ($row in $matchingRows) {
        if ($targetRows.Count -lt $Records.Count) { $targetRows.Add($row) }
    }
    foreach ($row in $blankRows) {
        if ($targetRows.Count -lt $Records.Count -and -not $targetRows.Contains($row)) { $targetRows.Add($row) }
    }
    $appendRow = [Math]::Max(2, $originalLastRow + 1)
    while ($targetRows.Count -lt $Records.Count) {
        $targetRows.Add($appendRow)
        $appendRow++
    }

    $importTime = [datetime]::Now.ToOADate()
    for ($i = 0; $i -lt $Records.Count; $i++) {
        $r = $Records[$i]
        $values = [Array]::CreateInstance([object], 22)
        $values[0] = Convert-IsoToOADate $Report.SnapshotDate
        $values[1] = $importTime
        $values[2] = $Config.ModelName
        $values[3] = $Report.ParentAsin
        $values[4] = $r.Keyword
        $values[5] = $r.Translation
        $values[6] = $r.KeywordType
        $values[7] = $r.TrafficRank
        $values[8] = $r.TrafficShare
        $values[9] = $r.NaturalRank
        $values[10] = Convert-IsoToOADate $r.NaturalRankDate
        $values[11] = $r.NaturalChildAsin
        $values[12] = $r.SPRank
        $values[13] = Convert-IsoToOADate $r.SPRankDate
        $values[14] = $r.SPCampaign
        $values[15] = $r.SPChildAsin
        $values[16] = $r.WeeklyABARank
        $values[17] = $r.WeeklySearchVolume
        $values[18] = if ($r.IsWatched) { '是' } else { '否' }
        $values[19] = $r.Status
        $values[20] = $Report.SourceFile
        $values[21] = $r.ClickConversionRate
        $excelRow = $targetRows[$i]
        [void]$Sheet.Range("A${excelRow}:V${excelRow}").ClearContents()
        for ($c = 0; $c -lt 22; $c++) {
            $rawValue = $values[$c]
            if ($null -ne $rawValue -and -not ($rawValue -is [string] -and $rawValue.Length -eq 0)) {
                try {
                    $targetCell = $Sheet.Cells.Item([int]$excelRow, [int]($c + 1))
                    if ($rawValue -is [string]) {
                        $targetCell.Value2 = [string]$rawValue
                    }
                    else {
                        $comValue = Convert-ToComScalar $rawValue
                        $targetCell.Value2 = $comValue
                    }
                }
                catch {
                    $typeName = $rawValue.GetType().FullName
                    throw ("历史写入失败：行={0} 列={1} 类型={2} 值={3}；原因={4}" -f $excelRow, ($c + 1), $typeName, [string]$rawValue, $_.Exception.Message)
                }
            }
        }
        $Sheet.Cells.Item($excelRow, 1).NumberFormat = 'yyyy-mm-dd'
        $Sheet.Cells.Item($excelRow, 2).NumberFormat = 'yyyy-mm-dd hh:mm:ss'
        $Sheet.Cells.Item($excelRow, 9).NumberFormat = '0.00%'
        $Sheet.Cells.Item($excelRow, 11).NumberFormat = 'yyyy-mm-dd'
        $Sheet.Cells.Item($excelRow, 14).NumberFormat = 'yyyy-mm-dd'
        $Sheet.Cells.Item($excelRow, 8).NumberFormat = '0'
        $Sheet.Cells.Item($excelRow, 10).NumberFormat = '0'
        $Sheet.Cells.Item($excelRow, 13).NumberFormat = '0'
        $Sheet.Range("Q${excelRow}:R${excelRow}").NumberFormat = '#,##0'
        $Sheet.Cells.Item($excelRow, 22).NumberFormat = '0.00%'
    }
    if ($matchingRows.Count -gt $Records.Count) {
        for ($i = $Records.Count; $i -lt $matchingRows.Count; $i++) {
            [void]$Sheet.Range("A$($matchingRows[$i]):V$($matchingRows[$i])").ClearContents()
        }
    }
    return $Records.Count
}

function Read-History {
    param([object]$Sheet)
    $lastRow = [int]$Sheet.UsedRange.Rows.Count
    if ($lastRow -lt 2) { return @() }
    $data = $Sheet.Range("A2:V$lastRow").Value2
    $records = New-Object System.Collections.Generic.List[object]
    for ($r = 1; $r -le ($lastRow - 1); $r++) {
        $keyword = ([string](Get-CellValue $data $r 5)).Trim()
        $snapshot = Convert-ToIsoDate (Get-CellValue $data $r 1)
        if ([string]::IsNullOrWhiteSpace($keyword) -or [string]::IsNullOrWhiteSpace($snapshot)) { continue }
        $records.Add([pscustomobject]@{
            SnapshotDate = $snapshot
            ModelName = [string](Get-CellValue $data $r 3)
            ParentAsin = [string](Get-CellValue $data $r 4)
            Keyword = $keyword
            Translation = [string](Get-CellValue $data $r 6)
            KeywordType = [string](Get-CellValue $data $r 7)
            TrafficRank = Convert-ToNullableNumber (Get-CellValue $data $r 8)
            TrafficShare = Convert-ToNullableNumber (Get-CellValue $data $r 9)
            NaturalRank = Convert-ToNullableNumber (Get-CellValue $data $r 10)
            NaturalRankDate = Convert-ToIsoDate (Get-CellValue $data $r 11)
            NaturalChildAsin = [string](Get-CellValue $data $r 12)
            SPRank = Convert-ToNullableNumber (Get-CellValue $data $r 13)
            SPRankDate = Convert-ToIsoDate (Get-CellValue $data $r 14)
            SPCampaign = [string](Get-CellValue $data $r 15)
            SPChildAsin = [string](Get-CellValue $data $r 16)
            WeeklyABARank = Convert-ToNullableNumber (Get-CellValue $data $r 17)
            WeeklySearchVolume = Convert-ToNullableNumber (Get-CellValue $data $r 18)
            IsWatched = ([string](Get-CellValue $data $r 19)) -eq '是'
            Status = [string](Get-CellValue $data $r 20)
            SourceFile = [string](Get-CellValue $data $r 21)
            ClickConversionRate = Convert-ToNullableNumber (Get-CellValue $data $r 22)
        })
    }
    return $records.ToArray()
}

function Sync-HistoryModelName {
    param(
        [object]$Sheet,
        [object]$Config
    )
    $lastRow = [int]$Sheet.UsedRange.Rows.Count
    if ($lastRow -lt 2) { return }
    $data = $Sheet.Range("C2:D$lastRow").Value2
    for ($r = 1; $r -le ($lastRow - 1); $r++) {
        $parentAsin = ([string](Get-CellValue $data $r 2)).Trim().ToUpperInvariant()
        if ($parentAsin -eq $Config.ParentAsin) {
            $Sheet.Cells.Item(($r + 1), 3).Value2 = [string]$Config.ModelName
        }
    }
}

function Get-SourceFingerprint {
    param([IO.FileInfo]$File)
    return ("{0}|{1}" -f $File.Length, $File.LastWriteTimeUtc.Ticks)
}

function Get-SuccessfulImportStates {
    param([object]$Workbook)
    $states = @{}
    $sheet = Get-Worksheet $Workbook '导入日志'
    if ($null -eq $sheet) { return $states }
    try {
        if ([string]::IsNullOrWhiteSpace([string]$sheet.Cells.Item(1, 8).Value2)) {
            $sheet.Cells.Item(1, 8).Value2 = '文件指纹'
            $sheet.Columns.Item(8).ColumnWidth = 30
        }
        $lastRow = [int]$sheet.UsedRange.Rows.Count
        for ($row = 2; $row -le $lastRow; $row++) {
            $fileName = ([string]$sheet.Cells.Item($row, 2).Value2).Trim()
            $status = ([string]$sheet.Cells.Item($row, 5).Value2).Trim()
            if ([string]::IsNullOrWhiteSpace($fileName) -or $status -notin @('成功', '初始种子')) { continue }
            $importTimeValue = $sheet.Cells.Item($row, 1).Value2
            $importTime = $null
            if ($null -ne $importTimeValue -and [string]$importTimeValue -ne '') {
                try { $importTime = [datetime]::FromOADate([double]$importTimeValue) } catch {}
            }
            $fingerprint = ([string]$sheet.Cells.Item($row, 8).Value2).Trim()
            $existing = $states[$fileName.ToLowerInvariant()]
            if ($null -eq $existing -or ($null -ne $importTime -and $importTime -gt $existing.ImportTime)) {
                $states[$fileName.ToLowerInvariant()] = [pscustomobject]@{
                    ImportTime = $importTime
                    Fingerprint = $fingerprint
                }
            }
        }
        return $states
    }
    finally { Release-ComObjectSafe $sheet }
}

function Add-ImportLog {
    param(
        [object]$Workbook,
        [string]$FileName,
        [string]$ParentAsin,
        [string]$SnapshotDate,
        [string]$Status,
        [int]$Count,
        [string]$Message,
        [string]$Fingerprint
    )
    $sheet = Get-Worksheet $Workbook '导入日志'
    if ($null -eq $sheet) { return }
    try {
        $row = [Math]::Max(2, [int]$sheet.UsedRange.Rows.Count + 1)
        $sheet.Cells.Item($row, 1).Value2 = [datetime]::Now.ToOADate()
        $sheet.Cells.Item($row, 2).Value2 = $FileName
        $sheet.Cells.Item($row, 3).Value2 = $ParentAsin
        if (-not [string]::IsNullOrWhiteSpace($SnapshotDate)) {
            $sheet.Cells.Item($row, 4).Value2 = Convert-IsoToOADate $SnapshotDate
        }
        $sheet.Cells.Item($row, 5).Value2 = $Status
        $sheet.Cells.Item($row, 6).Value2 = $Count
        $sheet.Cells.Item($row, 7).Value2 = $Message
        $sheet.Cells.Item($row, 8).Value2 = $Fingerprint
        $sheet.Cells.Item($row, 1).NumberFormat = 'yyyy-mm-dd hh:mm:ss'
        $sheet.Cells.Item($row, 4).NumberFormat = 'yyyy-mm-dd'
    }
    finally { Release-ComObjectSafe $sheet }
}

function Update-Dashboard {
    param(
        [object]$Workbook,
        [object]$Config,
        [object[]]$WatchEntries,
        [bool]$UseLatestDate
    )
    $historySheet = Get-Worksheet $Workbook $Config.HistorySheet
    $dashboard = Get-Worksheet $Workbook $Config.DashboardSheet
    if ($null -eq $historySheet -or $null -eq $dashboard) {
        throw "型号 $($Config.ModelName) 对应的看板或历史Sheet不存在。"
    }
    try {
        $dashboard.Cells.Item(1, 1).Value2 = [string]("$($Config.ModelName)｜关键词排名每日跟进")
        $dashboard.Cells.Item(3, 2).Value2 = [string]$Config.ModelName
        $dashboard.Cells.Item(3, 5).Value2 = [string]$Config.ParentAsin
        $history = @(Read-History $historySheet)
        if ($history.Count -eq 0) { return }
        $dates = @($history | Select-Object -ExpandProperty SnapshotDate -Unique | Sort-Object)
        $latestDate = $dates[-1]
        $selectedDate = Convert-ToIsoDate $dashboard.Range('H3').Value2
        if ($UseLatestDate -or [string]::IsNullOrWhiteSpace($selectedDate) -or $selectedDate -notin $dates) {
            $selectedDate = $latestDate
        }
        $dashboard.Range('H3').Value2 = Convert-IsoToOADate $selectedDate
        $dashboard.Range('H3').NumberFormat = 'yyyy-mm-dd'

        $dateList = $dashboard.Range('CE2:CE366')
        [void]$dateList.ClearContents()
        for ($i = 0; $i -lt $dates.Count; $i++) {
            $dashboard.Cells.Item(($i + 2), 83).Value2 = Convert-IsoToOADate $dates[$i]
        }
        $dashboard.Range("CE2:CE$($dates.Count + 1)").NumberFormat = 'yyyy-mm-dd'
        try { $dashboard.Range('H3').Validation.Delete() } catch {}
        try { $dashboard.Range('H3').Validation.Add(3, 1, 1, "=`$CE`$2:`$CE`$$($dates.Count + 1)") } catch {}

        $watchOrder = @{}
        $watchNotes = @{}
        $order = 0
        foreach ($w in ((Get-WatchesForConfig $WatchEntries $Config) | Sort-Object Order)) {
            $key = $w.Keyword.ToLowerInvariant()
            $watchOrder[$key] = $order
            $watchNotes[$key] = $w.Note
            $order++
        }

        $currentList = New-Object System.Collections.Generic.List[object]
        $currentMap = @{}
        foreach ($record in ($history | Where-Object { $_.SnapshotDate -eq $selectedDate })) {
            $key = $record.Keyword.ToLowerInvariant()
            if ($watchOrder.ContainsKey($key) -or ($null -ne $record.TrafficRank -and [int]$record.TrafficRank -le 100)) {
                $currentList.Add($record)
                $currentMap[$key] = $true
            }
        }
        $latestByKeyword = @{}
        foreach ($record in ($history | Where-Object { $_.SnapshotDate -le $selectedDate })) {
            $key = $record.Keyword.ToLowerInvariant()
            if (-not $latestByKeyword.ContainsKey($key) -or $record.SnapshotDate -gt $latestByKeyword[$key].SnapshotDate) {
                $latestByKeyword[$key] = $record
            }
        }
        foreach ($watch in (Get-WatchesForConfig $WatchEntries $Config)) {
            $key = $watch.Keyword.ToLowerInvariant()
            if ($currentMap.ContainsKey($key)) { continue }
            if ($latestByKeyword.ContainsKey($key)) {
                $base = $latestByKeyword[$key]
                $currentList.Add([pscustomobject]@{
                    SnapshotDate = $selectedDate; ModelName = $Config.ModelName; ParentAsin = $Config.ParentAsin
                    Keyword = $base.Keyword; Translation = $base.Translation; KeywordType = $base.KeywordType
                    TrafficRank = $null; TrafficShare = $null; NaturalRank = $null; NaturalRankDate = $null
                    NaturalChildAsin = ''; SPRank = $null; SPRankDate = $null; SPCampaign = ''; SPChildAsin = ''
                    WeeklyABARank = $null; WeeklySearchVolume = $null; ClickConversionRate = $null
                    IsWatched = $true; Status = '本日报表未出现'; SourceFile = ''
                })
            }
        }
        $current = @($currentList | Sort-Object @{ Expression = {
            $key = $_.Keyword.ToLowerInvariant()
            if ($watchOrder.ContainsKey($key)) { return $watchOrder[$key] }
            return 10000 + $(if ($null -eq $_.TrafficRank) { 9999 } else { [int]$_.TrafficRank })
        }; Ascending = $true })

        [void]$dashboard.Range('A10:R309').ClearContents()
        [void]$dashboard.Range('T8:CA309').ClearContents()
        try { $dashboard.Range('A10:B309').SparklineGroups.Clear() } catch {}

        $rowCount = [Math]::Min(300, $current.Count)
        if ($rowCount -eq 0) { return }
        $visible = New-ObjectMatrix $rowCount 16
        $helper = New-ObjectMatrix $rowCount 60
        $dateWindow = @($dates | Where-Object { $_ -le $selectedDate } | Select-Object -Last 30)
        $offset = 30 - $dateWindow.Count
        $pointMap = @{}
        $priorMap = @{}
        foreach ($historyRecord in $history) {
            $historyKey = $historyRecord.Keyword.ToLowerInvariant()
            $pointMap["$historyKey|$($historyRecord.SnapshotDate)"] = $historyRecord
            if ($historyRecord.SnapshotDate -lt $selectedDate) {
                if (-not $priorMap.ContainsKey($historyKey) -or
                    $historyRecord.SnapshotDate -gt $priorMap[$historyKey].SnapshotDate) {
                    $priorMap[$historyKey] = $historyRecord
                }
            }
        }
        for ($d = 0; $d -lt $dateWindow.Count; $d++) {
            $col = 20 + $offset + $d
            $dashboard.Cells.Item(8, $col).Value2 = Convert-IsoToOADate $dateWindow[$d]
            $dashboard.Cells.Item(8, (49 + $offset + $d)).Value2 = Convert-IsoToOADate $dateWindow[$d]
        }

        $naturalUp = 0
        $spUp = 0
        for ($i = 0; $i -lt $rowCount; $i++) {
            $r = $current[$i]
            $key = $r.Keyword.ToLowerInvariant()
            $prior = if ($priorMap.ContainsKey($key)) { $priorMap[$key] } else { $null }

            $naturalArrow = ''
            $spArrow = ''
            if ($null -ne $prior -and $null -ne $r.NaturalRank -and $null -ne $prior.NaturalRank) {
                if ($r.NaturalRank -lt $prior.NaturalRank) { $naturalArrow = '↑'; $naturalUp++ }
                elseif ($r.NaturalRank -gt $prior.NaturalRank) { $naturalArrow = '↓' }
                else { $naturalArrow = '—' }
            }
            if ($null -ne $prior -and $null -ne $r.SPRank -and $null -ne $prior.SPRank) {
                if ($r.SPRank -lt $prior.SPRank) { $spArrow = '↑'; $spUp++ }
                elseif ($r.SPRank -gt $prior.SPRank) { $spArrow = '↓' }
                else { $spArrow = '—' }
            }

            $values = @(
                $(if ($watchOrder.ContainsKey($key)) { '★' } else { '☆' }),
                $r.TrafficRank,
                $r.Keyword,
                $r.Translation,
                $r.KeywordType,
                $r.TrafficShare,
                $(if ($null -eq $r.NaturalRank) { '未上榜' } else { $r.NaturalRank }),
                $naturalArrow,
                $(if ($r.NaturalRankDate) { Convert-IsoToOADate $r.NaturalRankDate } else { $null }),
                $(if ($null -eq $r.SPRank) { '未上榜' } else { $r.SPRank }),
                $spArrow,
                $(if ($r.SPRankDate) { Convert-IsoToOADate $r.SPRankDate } else { $null }),
                $r.WeeklyABARank,
                $r.WeeklySearchVolume,
                $r.Status,
                $(if ($watchNotes.ContainsKey($key)) { $watchNotes[$key] } else { '' })
            )
            for ($c = 0; $c -lt 16; $c++) { $visible[$i, $c] = $values[$c] }

            for ($d = 0; $d -lt $dateWindow.Count; $d++) {
                $pointKey = "$key|$($dateWindow[$d])"
                $point = if ($pointMap.ContainsKey($pointKey)) { $pointMap[$pointKey] } else { $null }
                if ($null -ne $point) {
                    if ($null -ne $point.NaturalRank) { $helper[$i, ($offset + $d)] = 10000 - [double]$point.NaturalRank }
                    if ($null -ne $point.SPRank) { $helper[$i, (30 + $offset + $d)] = 10000 - [double]$point.SPRank }
                }
            }
        }

        $lastRow = 9 + $rowCount
        for ($i = 0; $i -lt $rowCount; $i++) {
            $excelRow = 10 + $i
            for ($c = 0; $c -lt 16; $c++) {
                $cellValue = $visible[$i, $c]
                if ($null -eq $cellValue -or ($cellValue -is [string] -and $cellValue.Length -eq 0)) {
                    continue
                }
                try {
                    $targetCell = $dashboard.Cells.Item([int]$excelRow, [int]($c + 3))
                    if ($cellValue -is [string]) {
                        $targetCell.Value2 = [string]$cellValue
                    }
                    else {
                        $comValue = Convert-ToComScalar $cellValue
                        $targetCell.Value2 = $comValue
                    }
                }
                catch {
                    $typeName = if ($null -eq $cellValue) { 'null' } else { $cellValue.GetType().FullName }
                    throw ("看板写入失败：行={0} 列={1} 类型={2} 值={3}；原因={4}" -f $excelRow, ($c + 3), $typeName, [string]$cellValue, $_.Exception.Message)
                }
            }
            for ($c = 0; $c -lt 60; $c++) {
                if ($null -ne $helper[$i, $c]) {
                    $comValue = Convert-ToComScalar $helper[$i, $c]
                    $dashboard.Cells.Item($excelRow, ($c + 20)).Value2 = $comValue
                }
            }
        }
        $dashboard.Range("H10:H$lastRow").NumberFormat = '0.00%'
        $dashboard.Range("K10:K$lastRow").NumberFormat = 'yyyy-mm-dd'
        $dashboard.Range("N10:N$lastRow").NumberFormat = 'yyyy-mm-dd'
        $dashboard.Range("D10:D$lastRow").NumberFormat = '0'
        $dashboard.Range("O10:P$lastRow").NumberFormat = '#,##0'
        $dashboard.Range("A10:R$lastRow").RowHeight = 22
        Apply-StarValidation $dashboard.Range('C10:C309')

        $red = Get-OleColor '#F8CBAD'
        $green = Get-OleColor '#C6E0B4'
        for ($i = 0; $i -lt $rowCount; $i++) {
            $row = 10 + $i
            $dashboard.Cells.Item($row, 9).Interior.ColorIndex = -4142
            $dashboard.Cells.Item($row, 12).Interior.ColorIndex = -4142
            if ($visible[$i, 7] -eq '↑') { $dashboard.Cells.Item($row, 9).Interior.Color = $red }
            elseif ($visible[$i, 7] -eq '↓') { $dashboard.Cells.Item($row, 9).Interior.Color = $green }
            if ($visible[$i, 10] -eq '↑') { $dashboard.Cells.Item($row, 12).Interior.Color = $red }
            elseif ($visible[$i, 10] -eq '↓') { $dashboard.Cells.Item($row, 12).Interior.Color = $green }
        }

        $sparklineFailures = 0
        for ($i = 0; $i -lt $rowCount; $i++) {
            $sparkRow = 10 + $i
            foreach ($sparkConfig in @(
                [pscustomobject]@{ Target = "A$sparkRow"; Source = "T${sparkRow}:AW${sparkRow}"; Color = '#2563EB' },
                [pscustomobject]@{ Target = "B$sparkRow"; Source = "AX${sparkRow}:CA${sparkRow}"; Color = '#F59E0B' }
            )) {
                $sparkGroup = $null
                try {
                    $sparkSource = "'$($dashboard.Name.Replace("'", "''"))'!$($sparkConfig.Source)"
                    $sparkGroup = $dashboard.Range($sparkConfig.Target).SparklineGroups.Add(1, $sparkSource)
                    # 辅助数据列会隐藏；WPS 默认仅绘制可见数据，若不关闭此选项，迷你图对象存在但画面为空。
                    try { $sparkGroup.DisplayHidden = $true } catch {}
                    try { $sparkGroup.PlotVisibleOnly = $false } catch {}
                    try { $sparkGroup.SeriesColor.Color = Get-OleColor $sparkConfig.Color } catch {}
                    try { $sparkGroup.LineWeight = 1.5 } catch {}
                    try {
                        $sparkGroup.Points.Markers.Visible = $true
                        $sparkGroup.Points.Markers.Color.Color = Get-OleColor $sparkConfig.Color
                    } catch {}
                }
                catch { $sparklineFailures++ }
                finally { Release-ComObjectSafe $sparkGroup }
            }
        }
        if ($sparklineFailures -gt 0) {
            $dashboard.Range('A7').Value2 = "走势图部分生成失败：$sparklineFailures"
        }
        else {
            $dashboard.Range('A7').Value2 = '图例（1天显示点，2天起显示折线）'
        }

        $dashboard.Range('B5').Value2 = [double]$rowCount
        $dashboard.Range('E5').Value2 = [double]@($current | Where-Object { $watchOrder.ContainsKey($_.Keyword.ToLowerInvariant()) }).Count
        $dashboard.Range('H5').Value2 = [double]$naturalUp
        $dashboard.Range('K5').Value2 = [double]$spUp
        $dashboard.Range('N5').Value2 = '关注词置顶 + 完整流量前100'
        try { $dashboard.Range("A9:R$lastRow").AutoFilter() } catch {}
        try { $dashboard.Range('T:CE').EntireColumn.Hidden = $true } catch {}
    }
    finally {
        Release-ComObjectSafe $historySheet
        Release-ComObjectSafe $dashboard
    }
}

function Get-ColumnLetter {
    param([int]$ColumnNumber)
    $result = ''
    $n = $ColumnNumber
    while ($n -gt 0) {
        $n--
        $result = [char](65 + ($n % 26)) + $result
        $n = [math]::Floor($n / 26)
    }
    return $result
}

function Set-RangeFillByAddresses {
    param(
        [object]$Sheet,
        [System.Collections.Generic.List[string]]$Addresses,
        [int]$Color
    )
    if ($Addresses.Count -eq 0) { return }
    $chunkSize = 80
    for ($start = 0; $start -lt $Addresses.Count; $start += $chunkSize) {
        $end = [Math]::Min($Addresses.Count - 1, $start + $chunkSize - 1)
        $chunk = @($Addresses[$start..$end])
        $range = $null
        try {
            $range = $Sheet.Range(($chunk -join ','))
            $range.Interior.Color = $Color
        }
        finally { Release-ComObjectSafe $range }
    }
}

function Update-ABAMonthly {
    param(
        [object]$Workbook,
        [object]$Config,
        [object[]]$WatchEntries
    )
    if ([string]::IsNullOrWhiteSpace($Config.ABAMonthlySheet)) { return }
    $historySheet = Get-Worksheet $Workbook $Config.HistorySheet
    $abaSheet = Get-Worksheet $Workbook $Config.ABAMonthlySheet
    if ($null -eq $historySheet -or $null -eq $abaSheet) {
        throw ("型号 {0} 对应的历史或ABA月度Sheet不存在。" -f $Config.ModelName)
    }
    try {
        Ensure-HistorySchema $historySheet
        $history = @(Read-History $historySheet)
        if ($history.Count -eq 0) { return }
        $years = @($history | ForEach-Object { [int]$_.SnapshotDate.Substring(0, 4) } | Sort-Object -Unique)
        if ($years.Count -eq 0) { return }
        $selectedYear = 0
        try { $selectedYear = [int]$abaSheet.Range('E3').Value2 } catch {}
        if ($selectedYear -notin $years) { $selectedYear = [int]$years[-1] }

        $abaSheet.Cells.Item(1, 1).Value2 = [string]("$($Config.ModelName)｜ABA月度排名")
        [void]$abaSheet.Range('A1:Q1').UnMerge()
        [void]$abaSheet.Range('A1:Q1').Merge()
        $abaSheet.Range('A1:Q1').Interior.Color = Get-OleColor '#17365D'
        $abaSheet.Range('A1:Q1').Font.Color = Get-OleColor '#FFFFFF'
        $abaSheet.Range('A1:Q1').Font.Bold = $true
        $abaSheet.Range('A1:Q1').Font.Size = 16
        $abaSheet.Range('A1:Q1').RowHeight = 30
        [void]$abaSheet.Range('A2:Q2').UnMerge()
        [void]$abaSheet.Range('A2:Q2').Merge()
        $abaSheet.Range('A2').Value2 = '月度ABA取当月最后一次有效排名；搜索量和点击转化率显示所选年份内最高值；空白表示没有数据。'
        $abaSheet.Range('A2:Q2').Interior.Color = Get-OleColor '#FFF2CC'
        $abaSheet.Range('D3').Value2 = '查看年份'
        $abaSheet.Range('E3').Value2 = [double]$selectedYear
        $abaSheet.Range('D3').Interior.Color = Get-OleColor '#D9EAF7'
        $abaSheet.Range('E3').Interior.Color = Get-OleColor '#FFF2CC'
        $abaSheet.Range('D3:E3').Font.Bold = $true
        $abaSheet.Range('D3:E3').HorizontalAlignment = -4108
        [void]$abaSheet.Range('S2:S20').ClearContents()
        for ($index = 0; $index -lt $years.Count; $index++) {
            $abaSheet.Cells.Item(($index + 2), 19).Value2 = [double]$years[$index]
        }
        try { $abaSheet.Range('E3').Validation.Delete() } catch {}
        try { $abaSheet.Range('E3').Validation.Add(3, 1, 1, "=`$S`$2:`$S`$$($years.Count + 1)") } catch {}
        $abaSheet.Columns.Item(19).Hidden = $true

        $headers = @('关注状态', '关键词', '翻译', '搜索量（年内最高）', '点击转化率（年内最高）') + (1..12 | ForEach-Object { "${_}月ABA" })
        for ($column = 1; $column -le $headers.Count; $column++) {
            $abaSheet.Cells.Item(5, $column).Value2 = [string]$headers[$column - 1]
        }
        $abaSheet.Range('A5:Q5').Interior.Color = Get-OleColor '#1F4E78'
        $abaSheet.Range('A5:Q5').Font.Color = Get-OleColor '#FFFFFF'
        $abaSheet.Range('A5:Q5').Font.Bold = $true
        $abaSheet.Range('A5:Q5').HorizontalAlignment = -4108

        $yearHistory = @($history | Where-Object { [int]$_.SnapshotDate.Substring(0, 4) -eq $selectedYear })
        $groups = @{}
        foreach ($record in $yearHistory) {
            $key = $record.Keyword.ToLowerInvariant()
            if (-not $groups.ContainsKey($key)) { $groups[$key] = New-Object System.Collections.Generic.List[object] }
            $groups[$key].Add($record)
        }
        $watchOrder = @{}
        $watchSet = @{}
        $watchIndex = 0
        foreach ($watch in ((Get-WatchesForConfig $WatchEntries $Config) | Sort-Object Order)) {
            $key = $watch.Keyword.ToLowerInvariant()
            $watchOrder[$key] = $watchIndex
            $watchSet[$key] = $true
            $watchIndex++
        }
        $orderedKeys = New-Object System.Collections.Generic.List[string]
        $seen = @{}
        foreach ($key in ($watchOrder.Keys | Sort-Object { $watchOrder[$_] })) {
            if ($groups.ContainsKey($key)) { $orderedKeys.Add($key); $seen[$key] = $true }
        }
        $remaining = @($groups.Keys | Where-Object { -not $seen.ContainsKey($_) } | Sort-Object @{ Expression = {
            $groupRecords = $groups[$_].ToArray()
            $latest = @($groupRecords | Sort-Object SnapshotDate -Descending | Select-Object -First 1)[0]
            if ($null -eq $latest.TrafficRank) { 999999 } else { [int]$latest.TrafficRank }
        }; Ascending = $true }, @{ Expression = { $_ }; Ascending = $true })
        foreach ($key in $remaining) { $orderedKeys.Add($key) }

        $oldLastRow = [Math]::Max(6, [int]$abaSheet.UsedRange.Rows.Count)
        [void]$abaSheet.Range("A6:Q$oldLastRow").ClearContents()
        $abaSheet.Range("A6:Q$oldLastRow").Interior.ColorIndex = -4142
        $red = Get-OleColor '#F8CBAD'
        $green = Get-OleColor '#C6E0B4'
        $labelValues = [Array]::CreateInstance([string], $orderedKeys.Count, 3)
        $numericValues = [Array]::CreateInstance([double], $orderedKeys.Count, 14)
        $redCells = New-Object 'System.Collections.Generic.List[string]'
        $greenCells = New-Object 'System.Collections.Generic.List[string]'
        for ($index = 0; $index -lt $orderedKeys.Count; $index++) {
            $key = $orderedKeys[$index]
            $records = @($groups[$key].ToArray())
            $latest = @($records | Sort-Object SnapshotDate -Descending | Select-Object -First 1)[0]
            $row = 6 + $index
            $labelValues[$index, 0] = if ($watchSet.ContainsKey($key)) { '★' } else { '☆' }
            $labelValues[$index, 1] = [string]$latest.Keyword
            $labelValues[$index, 2] = [string]$latest.Translation
            $searchValues = @($records | Where-Object { $null -ne $_.WeeklySearchVolume } | ForEach-Object { [double]$_.WeeklySearchVolume })
            $conversionValues = @($records | Where-Object { $null -ne $_.ClickConversionRate } | ForEach-Object { [double]$_.ClickConversionRate })
            if ($searchValues.Count -gt 0) { $numericValues[$index, 0] = [double](($searchValues | Measure-Object -Maximum).Maximum) }
            if ($conversionValues.Count -gt 0) { $numericValues[$index, 1] = [double](($conversionValues | Measure-Object -Maximum).Maximum) }
            $previousRank = $null
            for ($month = 1; $month -le 12; $month++) {
                $monthly = @($records | Where-Object {
                    $date = [datetime]::ParseExact($_.SnapshotDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
                    $date.Month -eq $month -and $null -ne $_.WeeklyABARank
                } | Sort-Object SnapshotDate -Descending | Select-Object -First 1)
                if ($monthly.Count -gt 0) {
                    $rank = [double]$monthly[0].WeeklyABARank
                    $numericValues[$index, (1 + $month)] = $rank
                    $address = "$(Get-ColumnLetter (5 + $month))$row"
                    if ($null -ne $previousRank) {
                        if ($rank -lt $previousRank) { $redCells.Add($address) }
                        elseif ($rank -gt $previousRank) { $greenCells.Add($address) }
                    }
                    $previousRank = $rank
                }
            }
        }
        $chunkSize = 50
        for ($chunkStart = 0; $chunkStart -lt $orderedKeys.Count; $chunkStart += $chunkSize) {
            $chunkRows = [Math]::Min($chunkSize, $orderedKeys.Count - $chunkStart)
            $labelChunk = [Array]::CreateInstance([string], $chunkRows, 3)
            $numericChunk = [Array]::CreateInstance([double], $chunkRows, 14)
            for ($chunkRow = 0; $chunkRow -lt $chunkRows; $chunkRow++) {
                for ($column = 0; $column -lt 3; $column++) { $labelChunk[$chunkRow, $column] = $labelValues[($chunkStart + $chunkRow), $column] }
                for ($column = 0; $column -lt 14; $column++) { $numericChunk[$chunkRow, $column] = $numericValues[($chunkStart + $chunkRow), $column] }
            }
            $startRow = 6 + $chunkStart
            $endRow = $startRow + $chunkRows - 1
            try { $abaSheet.Range("A${startRow}:C$endRow").Value2 = $labelChunk }
            catch {
                for ($chunkRow = 0; $chunkRow -lt $chunkRows; $chunkRow++) {
                    for ($column = 0; $column -lt 3; $column++) {
                        $abaSheet.Cells.Item(($startRow + $chunkRow), ($column + 1)).Value2 = [string]$labelChunk[$chunkRow, $column]
                    }
                }
            }
            try { $abaSheet.Range("D${startRow}:Q$endRow").Value2 = $numericChunk }
            catch {
                for ($chunkRow = 0; $chunkRow -lt $chunkRows; $chunkRow++) {
                    for ($column = 0; $column -lt 14; $column++) {
                        $abaSheet.Cells.Item(($startRow + $chunkRow), ($column + 4)).Value2 = [double]$numericChunk[$chunkRow, $column]
                    }
                }
            }
        }
        Set-RangeFillByAddresses $abaSheet $redCells $red
        Set-RangeFillByAddresses $abaSheet $greenCells $green
        $lastRow = [Math]::Max(6, 5 + $orderedKeys.Count)
        $abaSheet.Range("D6:D$lastRow").NumberFormat = '#,##0;-#,##0;;'
        $abaSheet.Range("E6:E$lastRow").NumberFormat = '0.00%;-0.00%;;'
        $abaSheet.Range("F6:Q$lastRow").NumberFormat = '#,##0;-#,##0;;'
        $abaSheet.Range("A6:Q$lastRow").RowHeight = 20
        $abaSheet.Columns.Item(1).ColumnWidth = 10
        $abaSheet.Columns.Item(2).ColumnWidth = 32
        $abaSheet.Columns.Item(3).ColumnWidth = 22
        $abaSheet.Columns.Item(4).ColumnWidth = 22
        $abaSheet.Columns.Item(5).ColumnWidth = 26
        $abaSheet.Range('F:Q').ColumnWidth = 10
        $abaSheet.Range("A5:Q$lastRow").Borders.LineStyle = 1
        try { $abaSheet.Range("A5:Q$lastRow").AutoFilter() } catch {}
        $abaSheet.Visible = -1
    }
    finally {
        Release-ComObjectSafe $historySheet
        Release-ComObjectSafe $abaSheet
    }
}

function Update-WorkbookNavigation {
    param(
        [object]$Workbook,
        [object[]]$Configs
    )
    $navigation = Get-Worksheet $Workbook '型号导航'
    if ($null -eq $navigation) {
        $navigation = $Workbook.Worksheets.Add()
        $navigation.Name = '型号导航'
        try { $navigation.Move($Workbook.Worksheets.Item(4)) } catch {}
    }
    try {
        [void]$navigation.Range('A1:G200').Clear()
        [void]$navigation.Range('A1:G1').Merge()
        $navigation.Cells.Item(1, 1).Value2 = '产品型号导航'
        $navigation.Range('A1:G1').Interior.Color = Get-OleColor '#17365D'
        $navigation.Range('A1:G1').Font.Color = Get-OleColor '#FFFFFF'
        $navigation.Range('A1:G1').Font.Bold = $true
        $navigation.Range('A1:G1').Font.Size = 16
        $navigation.Range('A1:G1').RowHeight = 30
        [void]$navigation.Range('A2:G2').Merge()
        $navigation.Cells.Item(2, 1).Value2 = '同一颜色代表同一产品；自然矩阵、SP矩阵、ABA月度为日常入口，看板随后，历史Sheet作为后台数据自动隐藏。'
        $navigation.Range('A2:G2').Interior.Color = Get-OleColor '#FFF2CC'
        $headers = @('产品名称', '父体ASIN', '自然排名矩阵', 'SP排名矩阵', 'ABA月度', '看板', '后台历史')
        for ($column = 1; $column -le $headers.Count; $column++) {
            $navigation.Cells.Item(4, $column).Value2 = [string]$headers[$column - 1]
        }
        $navigation.Range('A4:G4').Interior.Color = Get-OleColor '#1F4E78'
        $navigation.Range('A4:G4').Font.Color = Get-OleColor '#FFFFFF'
        $navigation.Range('A4:G4').Font.Bold = $true
        $navigation.Range('A4:G4').HorizontalAlignment = -4108

        $groupColors = @('#70AD47', '#5B9BD5', '#ED7D31', '#A5A5A5', '#FFC000', '#4472C4')
        for ($index = 0; $index -lt $Configs.Count; $index++) {
            $config = $Configs[$index]
            $row = 5 + $index
            $color = Get-OleColor $groupColors[$index % $groupColors.Count]
            $navigation.Cells.Item($row, 1).Value2 = [string]$config.ModelName
            $navigation.Cells.Item($row, 2).Value2 = [string]$config.ParentAsin
            $navigation.Cells.Item($row, 3).Value2 = '打开自然矩阵'
            $navigation.Cells.Item($row, 4).Value2 = '打开SP矩阵'
            $navigation.Cells.Item($row, 5).Value2 = '打开ABA月度'
            $navigation.Cells.Item($row, 6).Value2 = '打开看板'
            $navigation.Cells.Item($row, 7).Value2 = '已隐藏（自动维护）'
            $navigation.Range("A${row}:G${row}").Interior.Color = Get-OleColor '#F7F9FC'
            $navigation.Cells.Item($row, 1).Font.Bold = $true
            $navigation.Cells.Item($row, 1).Font.Color = $color
            foreach ($linkInfo in @(
                [pscustomobject]@{ Column = 3; SheetName = $config.NaturalMatrixSheet },
                [pscustomobject]@{ Column = 4; SheetName = $config.SPMatrixSheet },
                [pscustomobject]@{ Column = 5; SheetName = $config.ABAMonthlySheet },
                [pscustomobject]@{ Column = 6; SheetName = $config.DashboardSheet }
            )) {
                try {
                    $targetCell = $navigation.Cells.Item($row, $linkInfo.Column)
                    [void]$navigation.Hyperlinks.Add(
                        $targetCell,
                        '',
                        "'$($linkInfo.SheetName.Replace("'", "''"))'!A1",
                        '',
                        [string]$targetCell.Value2
                    )
                } catch {}
            }
            foreach ($sheetName in @(
                $config.DashboardSheet,
                $config.NaturalMatrixSheet,
                $config.SPMatrixSheet,
                $config.ABAMonthlySheet
            )) {
                $groupSheet = Get-Worksheet $Workbook $sheetName
                if ($null -ne $groupSheet) {
                    try {
                        $groupSheet.Visible = -1
                        $groupSheet.Tab.Color = $color
                    } catch {}
                    finally { Release-ComObjectSafe $groupSheet }
                }
            }
            $historySheet = Get-Worksheet $Workbook $config.HistorySheet
            if ($null -ne $historySheet) {
                try {
                    $historySheet.Tab.Color = $color
                    $historySheet.Visible = 0
                } catch {}
                finally { Release-ComObjectSafe $historySheet }
            }
        }
        # WPS/Excel 没有永久“Sheet 文件夹”，因此用相邻顺序、同色标签和导航页实现产品分组。
        # 每个产品组内把最常用的自然矩阵、SP矩阵放在前面，看板放在其后。
        $anchorSheet = Get-Worksheet $Workbook '导入日志'
        if ($null -ne $anchorSheet) {
            try {
                for ($configIndex = $Configs.Count - 1; $configIndex -ge 0; $configIndex--) {
                    $config = $Configs[$configIndex]
                    foreach ($sheetName in @(
                        $config.NaturalMatrixSheet,
                        $config.SPMatrixSheet,
                        $config.ABAMonthlySheet,
                        $config.DashboardSheet
                    )) {
                        $groupSheet = Get-Worksheet $Workbook $sheetName
                        if ($null -ne $groupSheet) {
                            try { $groupSheet.Move($anchorSheet) } catch {}
                            finally { Release-ComObjectSafe $groupSheet }
                        }
                    }
                    $nextAnchor = Get-Worksheet $Workbook $config.NaturalMatrixSheet
                    if ($null -ne $nextAnchor) {
                        Release-ComObjectSafe $anchorSheet
                        $anchorSheet = $nextAnchor
                    }
                }
            }
            finally { Release-ComObjectSafe $anchorSheet }
        }
        $navigation.Columns.Item(1).ColumnWidth = 30
        $navigation.Columns.Item(2).ColumnWidth = 18
        $navigation.Columns.Item(3).ColumnWidth = 18
        $navigation.Columns.Item(4).ColumnWidth = 20
        $navigation.Columns.Item(5).ColumnWidth = 18
        $navigation.Columns.Item(6).ColumnWidth = 18
        $navigation.Columns.Item(7).ColumnWidth = 22
        $navigation.Range("A4:G$([Math]::Max(5, 4 + $Configs.Count))").Borders.LineStyle = 1
        $firstNatural = if ($Configs.Count -gt 0) {
            Get-Worksheet $Workbook $Configs[0].NaturalMatrixSheet
        } else { $null }
        if ($null -ne $firstNatural) {
            try { $firstNatural.Activate() }
            finally { Release-ComObjectSafe $firstNatural }
        }
        else { $navigation.Activate() }
    }
    finally { Release-ComObjectSafe $navigation }
}

function Update-RankMatrix {
    param(
        [object]$Workbook,
        [object]$Config,
        [object[]]$WatchEntries,
        [ValidateSet('NaturalRank', 'SPRank')]
        [string]$Metric
    )
    $historySheet = Get-Worksheet $Workbook $Config.HistorySheet
    $matrixName = if ($Metric -eq 'NaturalRank') { $Config.NaturalMatrixSheet } else { $Config.SPMatrixSheet }
    if ([string]::IsNullOrWhiteSpace($matrixName)) { return }
    $matrixSheet = Get-Worksheet $Workbook $matrixName
    if ($null -eq $historySheet -or $null -eq $matrixSheet) {
        throw ("型号 {0} 对应的历史或矩阵Sheet不存在。" -f $Config.ModelName)
    }
    try {
        $matrixLabel = if ($Metric -eq 'NaturalRank') { '自然排名' } else { 'SP排名' }
        $matrixSheet.Cells.Item(1, 1).Value2 = [string]("$($Config.ModelName)｜${matrixLabel}每日跟进矩阵")
        $history = @(Read-History $historySheet)
        if ($history.Count -eq 0) { return }
        $dates = @($history | Select-Object -ExpandProperty SnapshotDate -Unique | Sort-Object)
        $latestDate = $dates[-1]
        $latest = @($history | Where-Object { $_.SnapshotDate -eq $latestDate })

        $keywordLookup = @{}
        foreach ($record in $history) {
            $key = $record.Keyword.ToLowerInvariant()
            if (-not $keywordLookup.ContainsKey($key)) { $keywordLookup[$key] = $record }
            elseif ($record.SnapshotDate -gt $keywordLookup[$key].SnapshotDate) { $keywordLookup[$key] = $record }
        }

        $orderedKeys = New-Object System.Collections.Generic.List[string]
        $seen = @{}
        foreach ($watch in ((Get-WatchesForConfig $WatchEntries $Config) | Sort-Object Order)) {
            $key = $watch.Keyword.ToLowerInvariant()
            if ($keywordLookup.ContainsKey($key) -and -not $seen.ContainsKey($key)) {
                $orderedKeys.Add($key); $seen[$key] = $true
            }
        }
        foreach ($record in ($latest | Sort-Object @{ Expression = {
            if ($null -eq $_.TrafficRank) { 999999 } else { [int]$_.TrafficRank }
        }; Ascending = $true })) {
            $key = $record.Keyword.ToLowerInvariant()
            if (-not $seen.ContainsKey($key)) { $orderedKeys.Add($key); $seen[$key] = $true }
        }
        foreach ($key in ($keywordLookup.Keys | Sort-Object)) {
            if (-not $seen.ContainsKey($key)) { $orderedKeys.Add($key); $seen[$key] = $true }
        }

        $usedRows = [int]$matrixSheet.UsedRange.Rows.Count
        $usedCols = [int]$matrixSheet.UsedRange.Columns.Count
        if ($usedRows -ge 5) {
            $lastUsedLetter = Get-ColumnLetter ([Math]::Max(4, $usedCols))
            [void]$matrixSheet.Range("A5:$lastUsedLetter$usedRows").ClearContents()
        }
        if ($usedCols -ge 4) {
            $lastUsedLetter = Get-ColumnLetter $usedCols
            $matrixSheet.Range("D4:$lastUsedLetter$usedRows").Interior.ColorIndex = -4142
        }

        $rowCount = $orderedKeys.Count
        $dateCount = $dates.Count
        $lastRow = 4 + $rowCount
        $lastColumn = 3 + $dateCount
        $lastColumnLetter = Get-ColumnLetter $lastColumn

        $matrixSheet.Cells.Item(4, 1).Value2 = '关注'
        $matrixSheet.Cells.Item(4, 2).Value2 = '关键词'
        $matrixSheet.Cells.Item(4, 3).Value2 = '翻译'
        $matrixSheet.Range('A4:C4').Interior.Color = Get-OleColor '#1F4E78'
        $matrixSheet.Range('A4:C4').Font.Color = Get-OleColor '#FFFFFF'
        $matrixSheet.Range('A4:C4').Font.Bold = $true
        $matrixSheet.Range('A4:C4').HorizontalAlignment = -4108

        # 矩阵全部是字符串标签或数值排名，使用同类型二维数组一次性写入 WPS。
        # 这比逐单元格 COM 调用更适合持续累积数百天的历史。
        $labels = [Array]::CreateInstance([string], $rowCount, 3)
        $values = [Array]::CreateInstance([double], $rowCount, $dateCount)
        $pointMap = @{}
        foreach ($record in $history) {
            $pointMap["$($record.Keyword.ToLowerInvariant())|$($record.SnapshotDate)"] = $record
        }
        $watchSet = @{}
        foreach ($watch in (Get-WatchesForConfig $WatchEntries $Config)) {
            $watchSet[$watch.Keyword.ToLowerInvariant()] = $true
        }

        for ($r = 0; $r -lt $rowCount; $r++) {
            $key = $orderedKeys[$r]
            $base = $keywordLookup[$key]
            $labels[$r, 0] = if ($watchSet.ContainsKey($key)) { '★' } else { '☆' }
            $labels[$r, 1] = [string]$base.Keyword
            $labels[$r, 2] = [string]$base.Translation
            for ($d = 0; $d -lt $dateCount; $d++) {
                $mapKey = "$key|$($dates[$d])"
                $rank = 0
                if ($pointMap.ContainsKey($mapKey)) {
                    $point = $pointMap[$mapKey]
                    $candidate = if ($Metric -eq 'NaturalRank') { $point.NaturalRank } else { $point.SPRank }
                    if ($null -ne $candidate) { $rank = [int]$candidate }
                }
                $values[$r, $d] = [double]$rank
            }
        }

        $dateHeader = [Array]::CreateInstance([double], 1, $dateCount)
        for ($d = 0; $d -lt $dateCount; $d++) { $dateHeader[0, $d] = Convert-IsoToOADate $dates[$d] }
        # WPS 对 1×N 二维数组的 COM 转换不稳定，日期表头数量较少，逐列写入更可靠。
        for ($d = 0; $d -lt $dateCount; $d++) {
            $columnLetter = Get-ColumnLetter (4 + $d)
            $matrixSheet.Range("${columnLetter}4").Value2 = Convert-ToComScalar $dateHeader[0, $d]
        }
        $matrixSheet.Range("D4:$lastColumnLetter" + '4').NumberFormat = 'm/d'
        $matrixSheet.Range("D4:$lastColumnLetter" + '4').Interior.Color = Get-OleColor '#00DDEB'
        $matrixSheet.Range("D4:$lastColumnLetter" + '4').Font.Bold = $true
        $matrixSheet.Range("D4:$lastColumnLetter" + '4').HorizontalAlignment = -4108
        # 真实关键词中可能包含 WPS 批量字符串转换不接受的内容；标签仅三列，逐格写入保证兼容。
        for ($r = 0; $r -lt $rowCount; $r++) {
            $excelRow = 5 + $r
            for ($c = 0; $c -lt 3; $c++) {
                $labelValue = $labels[$r, $c]
                if (-not [string]::IsNullOrEmpty($labelValue)) {
                    $matrixSheet.Cells.Item([int]$excelRow, [int]($c + 1)).Value2 = [string]$labelValue
                }
            }
        }
        if ($dateCount -gt 1) {
            $matrixChunkSize = 50
            for ($chunkStart = 0; $chunkStart -lt $rowCount; $chunkStart += $matrixChunkSize) {
                $chunkRows = [Math]::Min($matrixChunkSize, $rowCount - $chunkStart)
                $chunkValues = [Array]::CreateInstance([double], $chunkRows, $dateCount)
                for ($chunkRow = 0; $chunkRow -lt $chunkRows; $chunkRow++) {
                    for ($d = 0; $d -lt $dateCount; $d++) {
                        $chunkValues[$chunkRow, $d] = $values[($chunkStart + $chunkRow), $d]
                    }
                }
                $excelStartRow = 5 + $chunkStart
                $excelEndRow = $excelStartRow + $chunkRows - 1
                try {
                    $matrixSheet.Range("D${excelStartRow}:$lastColumnLetter$excelEndRow").Value2 = $chunkValues
                }
                catch {
                    # 极少数 WPS 版本可能拒绝某个批次，自动回退逐格写入，不让导入中断。
                    for ($chunkRow = 0; $chunkRow -lt $chunkRows; $chunkRow++) {
                        for ($d = 0; $d -lt $dateCount; $d++) {
                            $matrixSheet.Cells.Item(
                                [int]($excelStartRow + $chunkRow),
                                [int](4 + $d)
                            ).Value2 = Convert-ToComScalar $chunkValues[$chunkRow, $d]
                        }
                    }
                }
            }
        }
        else {
            # WPS 对 N×1 二维数组同样存在转换问题；首日数据量有限，逐行写入。
            for ($r = 0; $r -lt $rowCount; $r++) {
                $matrixSheet.Cells.Item([int](5 + $r), 4).Value2 = Convert-ToComScalar $values[$r, 0]
            }
        }
        $matrixSheet.Range("D5:$lastColumnLetter$lastRow").HorizontalAlignment = -4108
        $matrixSheet.Range("D5:$lastColumnLetter$lastRow").Interior.ColorIndex = -4142

        $red = Get-OleColor '#F8CBAD'
        $green = Get-OleColor '#C6E0B4'
        $gray = Get-OleColor '#E7E6E6'
        for ($d = 0; $d -lt $dateCount; $d++) {
            $columnLetter = Get-ColumnLetter (4 + $d)
            $redCells = New-Object 'System.Collections.Generic.List[string]'
            $greenCells = New-Object 'System.Collections.Generic.List[string]'
            $grayCells = New-Object 'System.Collections.Generic.List[string]'
            for ($r = 0; $r -lt $rowCount; $r++) {
                $current = [int]$values[$r, $d]
                $address = "$columnLetter$($r + 5)"
                if ($current -eq 0) {
                    $grayCells.Add($address)
                }
                elseif ($d -gt 0) {
                    $previous = [int]$values[$r, ($d - 1)]
                    if ($previous -eq 0 -or $current -lt $previous) { $redCells.Add($address) }
                    elseif ($current -gt $previous) { $greenCells.Add($address) }
                }
            }
            Set-RangeFillByAddresses $matrixSheet $redCells $red
            Set-RangeFillByAddresses $matrixSheet $greenCells $green
            Set-RangeFillByAddresses $matrixSheet $grayCells $gray
        }

        $matrixSheet.Range("A5:$lastColumnLetter$lastRow").RowHeight = 20
        $matrixSheet.Columns.Item(1).ColumnWidth = 6
        $matrixSheet.Columns.Item(2).ColumnWidth = 32
        $matrixSheet.Columns.Item(3).ColumnWidth = 22
        $matrixSheet.Range("D:$lastColumnLetter").ColumnWidth = 7
        Apply-StarValidation $matrixSheet.Range("A5:A$lastRow")
        try { $matrixSheet.Range("A4:$lastColumnLetter$lastRow").AutoFilter() } catch {}
    }
    finally {
        Release-ComObjectSafe $historySheet
        Release-ComObjectSafe $matrixSheet
    }
}

if ($ExtractOnly) {
    if ([string]::IsNullOrWhiteSpace($SourceFile)) { throw 'ExtractOnly 模式必须提供 SourceFile。' }
    $app = $null
    try {
        $app = New-Object -ComObject 'ket.Application'
        $app.Visible = $false
        $app.DisplayAlerts = $false
        $report = Read-SourceReport $app ([IO.Path]::GetFullPath($SourceFile))
        $report.Records = @($report.Records | Select-Object -First 100)
        $report | ConvertTo-Json -Depth 6 -Compress
    }
    finally {
        if ($null -ne $app) { try { $app.Quit() } catch {} }
        Release-ComObjectSafe $app
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
    }
    exit 0
}

$toolDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($WorkbookPath)) {
    $WorkbookPath = Join-Path $toolDir '关键词排名每日跟进表.xlsx'
}
if ([string]::IsNullOrWhiteSpace($SourceFolder)) {
    $SourceFolder = Join-Path $toolDir '每日源文件'
}
$WorkbookPath = [IO.Path]::GetFullPath($WorkbookPath)
$SourceFolder = [IO.Path]::GetFullPath($SourceFolder)

if (-not (Test-Path -LiteralPath $WorkbookPath)) { throw "找不到跟进表：$WorkbookPath" }
if (-not (Test-Path -LiteralPath $SourceFolder)) {
    New-Item -ItemType Directory -Path $SourceFolder | Out-Null
}

$lockFile = Join-Path ([IO.Path]::GetDirectoryName($WorkbookPath)) ('~$' + [IO.Path]::GetFileName($WorkbookPath))
if (Test-FileInUse $WorkbookPath) {
    throw @"
跟进表文件当前确实被其他进程占用，导入已安全停止，没有写入任何数据。

请按以下顺序操作：
1. 等待数秒后重试；
2. 如果仍提示占用，请关闭可能读取该文件的 WPS、文件预览或同步程序；
3. 再双击“导入每日关键词排名.cmd”。
"@
}
if (Test-Path -LiteralPath $lockFile) {
    Write-Host '提示：发现残留的 WPS 临时锁文件，但主文件实际可写，本次将继续导入。' -ForegroundColor Yellow
}

Write-Host '检查通过：跟进表未被占用。'
$backupDir = Join-Path $toolDir '备份'
if (-not (Test-Path -LiteralPath $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}
$backupPath = Join-Path $backupDir ("关键词排名每日跟进表_{0}.xlsx" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
Copy-Item -LiteralPath $WorkbookPath -Destination $backupPath

$app = $null
$tracker = $null
$importedAny = $false
$changedAsins = @{}
$watchChangeCount = 0
try {
    Write-Host '正在启动 WPS 并打开跟进表……'
    $app = New-Object -ComObject 'ket.Application'
    $app.Visible = $false
    $app.DisplayAlerts = $false
    $tracker = $app.Workbooks.Open($WorkbookPath, 0, $false)
    if ($AppAction -eq 'AddModel') {
        $newModelName = $AppModelName.Trim()
        $newParentAsin = $AppParentAsin.Trim().ToUpperInvariant()
        $newSite = $AppSite.Trim()
        if ([string]::IsNullOrWhiteSpace($newModelName)) { throw '产品名称不能为空。' }
        if ($newParentAsin -notmatch '^B0[A-Z0-9]{8}$') { throw '父体 ASIN 格式不正确，应为 B0 开头的 10 位字符。' }
        if ([string]::IsNullOrWhiteSpace($newSite)) { $newSite = '加拿大站点' }
        $configSheetForApp = Get-Worksheet $tracker '型号配置'
        if ($null -eq $configSheetForApp) { throw '跟进表缺少“型号配置”Sheet。' }
        try {
            $configLastRow = [Math]::Max(5, [int]$configSheetForApp.UsedRange.Rows.Count)
            $targetRow = 0
            $firstBlankRow = 0
            for ($row = 5; $row -le [Math]::Max($configLastRow + 1, 300); $row++) {
                $rowModel = ([string]$configSheetForApp.Cells.Item($row, 1).Value2).Trim()
                $rowAsin = ([string]$configSheetForApp.Cells.Item($row, 2).Value2).Trim().ToUpperInvariant()
                if ($firstBlankRow -eq 0 -and [string]::IsNullOrWhiteSpace($rowModel) -and [string]::IsNullOrWhiteSpace($rowAsin)) { $firstBlankRow = $row }
                if ($rowAsin -eq $newParentAsin -or $rowModel.Equals($newModelName, [StringComparison]::OrdinalIgnoreCase)) { $targetRow = $row; break }
                if ($row -gt $configLastRow -and $firstBlankRow -gt 0) { break }
            }
            $isNewRow = $targetRow -eq 0
            if ($isNewRow) { $targetRow = if ($firstBlankRow -gt 0) { $firstBlankRow } else { $configLastRow + 1 } }
            $configSheetForApp.Cells.Item($targetRow, 1).Value2 = [string]$newModelName
            $configSheetForApp.Cells.Item($targetRow, 2).Value2 = [string]$newParentAsin
            $configSheetForApp.Cells.Item($targetRow, 3).Value2 = [string]$newSite
            $configSheetForApp.Cells.Item($targetRow, 4).Value2 = '是'
            if ($isNewRow) { [void]$configSheetForApp.Range("E${targetRow}:I${targetRow}").ClearContents() }
            Write-Host (“已登记型号：{0} / {1}” -f $newModelName, $newParentAsin)
            if ([string]::IsNullOrWhiteSpace($OnlyAsin)) { $OnlyAsin = $newParentAsin }
        }
        finally { Release-ComObjectSafe $configSheetForApp }
    }
    Write-Host '正在检查型号配置并自动补齐所需Sheet……'
    $generatedSheetCount = Ensure-ModelWorksheets $tracker
    if ($generatedSheetCount -gt 0) {
        Write-Host ("型号配置完成：自动生成 {0} 张Sheet。" -f $generatedSheetCount)
    }
    $configs = @(Get-ModelConfigs $tracker)
    if ($configs.Count -eq 0) { throw '“型号配置”中没有启用的型号。' }
    $activeConfigs = $configs
    $normalizedOnlyAsin = ''
    if ($AppAction -in @('SetWatch', 'ReplaceWatches') -and [string]::IsNullOrWhiteSpace($OnlyAsin)) {
        $targetConfigForApp = $configs | Where-Object {
            $_.ModelName.Equals($AppModelName.Trim(), [StringComparison]::OrdinalIgnoreCase) -or
            $_.ParentAsin.Equals($AppModelName.Trim(), [StringComparison]::OrdinalIgnoreCase)
        } | Select-Object -First 1
        if ($null -eq $targetConfigForApp) { throw (“型号配置中找不到产品：{0}” -f $AppModelName) }
        $OnlyAsin = $targetConfigForApp.ParentAsin
    }
    if (-not [string]::IsNullOrWhiteSpace($OnlyAsin)) {
        $normalizedOnlyAsin = $OnlyAsin.Trim().ToUpperInvariant()
        $activeConfigs = @($configs | Where-Object { $_.ParentAsin -eq $normalizedOnlyAsin })
        if ($activeConfigs.Count -eq 0) { throw (“型号配置中找不到已启用的父体：{0}” -f $normalizedOnlyAsin) }
        Write-Host (“定向刷新：仅处理 {0} / {1}” -f $activeConfigs[0].ModelName, $normalizedOnlyAsin)
    }
    $appWatchChanged = $false
    if ($AppAction -eq 'SetWatch') {
        $targetConfigForApp = $activeConfigs | Where-Object {
            $_.ModelName.Equals($AppModelName.Trim(), [StringComparison]::OrdinalIgnoreCase) -or
            $_.ParentAsin.Equals($AppModelName.Trim(), [StringComparison]::OrdinalIgnoreCase)
        } | Select-Object -First 1
        if ($null -eq $targetConfigForApp) { throw (“型号配置中找不到产品：{0}” -f $AppModelName) }
        $normalizedKeyword = $AppKeyword.Trim()
        if ([string]::IsNullOrWhiteSpace($normalizedKeyword)) { throw '关键词不能为空。' }
        $isEnabledForApp = $AppEnabled.Trim().ToLowerInvariant() -in @('true', '1', 'yes', '是', '★')
        $watchSheetForApp = Get-Worksheet $tracker '关注关键词'
        if ($null -eq $watchSheetForApp) { throw '跟进表缺少“关注关键词”Sheet。' }
        try {
            Set-WatchEntryState $watchSheetForApp $targetConfigForApp $normalizedKeyword $isEnabledForApp
            $watchLastRow = [Math]::Max(5, [int]$watchSheetForApp.Cells.Item($watchSheetForApp.Rows.Count, 2).End(-4162).Row)
            for ($row = 5; $row -le $watchLastRow; $row++) {
                $rowModel = ([string]$watchSheetForApp.Cells.Item($row, 1).Value2).Trim()
                $rowKeyword = ([string]$watchSheetForApp.Cells.Item($row, 2).Value2).Trim()
                if (($rowModel -eq $targetConfigForApp.ModelName -or $rowModel.ToUpperInvariant() -eq $targetConfigForApp.ParentAsin) -and
                    $rowKeyword.Equals($normalizedKeyword, [StringComparison]::OrdinalIgnoreCase)) {
                    $watchSheetForApp.Cells.Item($row, 3).Value2 = [string]$AppNote
                    break
                }
            }
        }
        finally { Release-ComObjectSafe $watchSheetForApp }
        $appWatchChanged = $true
        $watchChangeCount = 1
        $changedAsins[$targetConfigForApp.ParentAsin.ToUpperInvariant()] = $true
        Write-Host (“已{0}关注词：{1} / {2}” -f $(if ($isEnabledForApp) { '启用' } else { '取消' }), $targetConfigForApp.ModelName, $normalizedKeyword)
    }
    elseif ($AppAction -eq 'ReplaceWatches') {
        if ([string]::IsNullOrWhiteSpace($AppKeywordsJson)) { throw '关注词顺序不能为空。' }
        try { $requestedItems = @($AppKeywordsJson | ConvertFrom-Json) } catch { throw '关注词数据无效。' }
        $watchSheetForApp = Get-Worksheet $tracker '关注关键词'
        if ($null -eq $watchSheetForApp) { throw '跟进表缺少“关注关键词”Sheet。' }
        try {
            $desired = @{}
            $orderedKeywords = New-Object System.Collections.Generic.List[string]
            foreach ($item in $requestedItems) {
                $keyword = ([string]$item.keyword).Trim()
                if ([string]::IsNullOrWhiteSpace($keyword)) { continue }
                $key = $keyword.ToLowerInvariant()
                if ($desired.ContainsKey($key)) { continue }
                $desired[$key] = [string]$item.note
                $orderedKeywords.Add($keyword)
            }
            $existing = @(Get-WatchesForConfig (Get-WatchEntries $tracker) $targetConfigForApp)
            foreach ($watch in $existing) {
                if (-not $desired.ContainsKey($watch.Keyword.ToLowerInvariant)) {
                    Set-WatchEntryState $watchSheetForApp $targetConfigForApp $watch.Keyword $false
                }
            }
            foreach ($keyword in $orderedKeywords) {
                Set-WatchEntryState $watchSheetForApp $targetConfigForApp $keyword $true
                $watchLastRow = [Math]::Max(5, [int]$watchSheetForApp.Cells.Item($watchSheetForApp.Rows.Count, 2).End(-4162).Row)
                for ($row = 5; $row -le $watchLastRow; $row++) {
                    $rowModel = ([string]$watchSheetForApp.Cells.Item($row, 1).Value2).Trim()
                    $rowKeyword = ([string]$watchSheetForApp.Cells.Item($row, 2).Value2).Trim()
                    if (($rowModel -eq $targetConfigForApp.ModelName -or $rowModel.ToUpperInvariant() -eq $targetConfigForApp.ParentAsin) -and $rowKeyword.Equals($keyword, [StringComparison]::OrdinalIgnoreCase)) {
                        $watchSheetForApp.Cells.Item($row, 3).Value2 = $desired[$keyword.ToLowerInvariant()]
                        break
                    }
                }
            }
            Reorder-WatchEntries $watchSheetForApp $targetConfigForApp ([string[]]$orderedKeywords)
        }
        finally { Release-ComObjectSafe $watchSheetForApp }
        # 关注词主表已直接写入；避免此轻量操作触发整本工作簿的日期/矩阵重建。
        $appWatchChanged = $false
        $watchChangeCount = 0
    }
    foreach ($config in $activeConfigs) {
        $historySheet = Get-Worksheet $tracker $config.HistorySheet
        if ($null -ne $historySheet) {
            try { Ensure-HistorySchema $historySheet }
            finally { Release-ComObjectSafe $historySheet }
        }
    }
    Write-Host '正在同步自然矩阵、SP矩阵和看板中的关注星标……'
    if ($appWatchChanged) {
        Write-Host '    软件星标已写入关注主表，将直接重建三个视图。'
    }
    elseif ($AppAction -eq 'ReplaceWatches') {
        Write-Host '    关注词主表已更新，跳过视图星标同步和整本工作簿重建。'
        $watchChangeCount = 0
        $RefreshOnly = $false
    }
    else {
        $watchSync = Sync-WatchEntriesFromViews $tracker $activeConfigs
        $watchChangeCount = [int]$watchSync.Count
        foreach ($asin in $watchSync.ChangedAsins.Keys) { $changedAsins[$asin] = $true }
        if ($watchChangeCount -eq 0) { Write-Host '    星标无变化。' }
        else { Write-Host (“    已同步 {0} 个关注状态变化。” -f $watchChangeCount) }
    }
    $watches = @(Get-WatchEntries $tracker)
    $watchBackfillRequests = @(Get-WatchBackfillRequests $tracker $activeConfigs $watches)

    $files = @(Get-ChildItem -LiteralPath $SourceFolder -Filter '*.xlsx' -File | Sort-Object LastWriteTime, Name)
    if (-not [string]::IsNullOrWhiteSpace($normalizedOnlyAsin)) {
        $files = @($files | Where-Object { $_.Name.ToUpperInvariant().Contains($normalizedOnlyAsin) })
    }
    $successfulStates = Get-SuccessfulImportStates $tracker
    $pendingFiles = New-Object System.Collections.Generic.List[object]
    $skippedFiles = New-Object System.Collections.Generic.List[object]
    if (-not $RefreshOnly) {
        foreach ($candidateFile in $files) {
            $candidateFingerprint = Get-SourceFingerprint $candidateFile
            $stateKey = $candidateFile.Name.ToLowerInvariant()
            $state = $successfulStates[$stateKey]
            $unchanged = $false
            if (-not $ForceReimport -and $null -ne $state) {
                if (-not [string]::IsNullOrWhiteSpace($state.Fingerprint)) {
                    $unchanged = $state.Fingerprint -eq $candidateFingerprint
                }
                elseif ($null -ne $state.ImportTime) {
                    $unchanged = $candidateFile.LastWriteTime -le $state.ImportTime.AddSeconds(1)
                }
            }
            if ($unchanged) { $skippedFiles.Add($candidateFile) }
            else { $pendingFiles.Add($candidateFile) }
        }
    }
    foreach ($request in $watchBackfillRequests) {
        $candidateMatches = @(Get-LatestSourceFileForAsin $files $request.Config.ParentAsin)
        if ($candidateMatches.Count -eq 0) {
            Write-Host ("    关注词待补录，但找不到 {0} 的源报表：{1}" -f $request.Config.ModelName, ($request.Keywords -join '、')) -ForegroundColor Yellow
            continue
        }
        $candidateFile = $candidateMatches[0]
        $alreadyPending = @($pendingFiles | Where-Object { $_.FullName -eq $candidateFile.FullName }).Count -gt 0
        if (-not $alreadyPending) {
            [void]$skippedFiles.Remove($candidateFile)
            $pendingFiles.Add($candidateFile)
        }
        Write-Host ("    新关注词补录：{0}｜重读最新源报表 {1}｜关键词：{2}" -f $request.Config.ModelName, $candidateFile.Name, ($request.Keywords -join '、'))
    }
    if ($skippedFiles.Count -gt 0) {
        Write-Host ("增量检查：已成功且未变化的文件 {0} 个，将直接跳过。" -f $skippedFiles.Count)
    }
    for ($fileIndex = 0; $fileIndex -lt $pendingFiles.Count; $fileIndex++) {
        $file = $pendingFiles[$fileIndex]
        $fileFingerprint = Get-SourceFingerprint $file
        Write-Host ("[{0}/{1}] 正在导入：{2}" -f ($fileIndex + 1), $pendingFiles.Count, $file.Name)
        $report = $null
        try {
            $report = Read-SourceReport $app $file.FullName
            $config = $activeConfigs | Where-Object { $_.ParentAsin -eq $report.ParentAsin } | Select-Object -First 1
            if ($null -eq $config) { throw ("父体 {0} 未在型号配置中启用。" -f $report.ParentAsin) }
            $historySheet = Get-Worksheet $tracker $config.HistorySheet
            if ($null -eq $historySheet) { throw "找不到历史Sheet：$($config.HistorySheet)" }
            try {
                $tracked = @(Select-TrackedRecords $report $config $watches)
                $count = Write-HistoryRows $historySheet $report $config $tracked
            }
            finally { Release-ComObjectSafe $historySheet }
            Add-ImportLog $tracker $report.SourceFile $report.ParentAsin $report.SnapshotDate '成功' $count '已替换同父体同日期旧快照，并写入新记录。' $fileFingerprint
            Write-Host ("    成功：快照日期 {0}，写入 {1} 条。" -f $report.SnapshotDate, $count)
            $importedAny = $true
            $changedAsins[$report.ParentAsin.ToUpperInvariant()] = $true
        }
        catch {
            $asin = if ($null -ne $report) { $report.ParentAsin } else { '' }
            $date = if ($null -ne $report) { $report.SnapshotDate } else { '' }
            Add-ImportLog $tracker $file.Name $asin $date '失败' 0 $_.Exception.Message $fileFingerprint
            Write-Host ("    失败：{0}" -f $_.Exception.Message) -ForegroundColor Red
        }
    }

    if ($importedAny -or $RefreshOnly -or $ForceReimport -or $watchChangeCount -gt 0) {
        Write-Host '正在刷新看板、排名矩阵、ABA月度和走势图……'
        foreach ($config in $activeConfigs) {
            $shouldRefreshConfig = $RefreshOnly -or $ForceReimport -or $changedAsins.ContainsKey($config.ParentAsin.ToUpperInvariant())
            if (-not $shouldRefreshConfig) {
                Write-Host ("    跳过未变化型号：{0}" -f $config.ModelName)
                continue
            }
            $configuredHistorySheet = Get-Worksheet $tracker $config.HistorySheet
            if ($null -ne $configuredHistorySheet) {
                try { Sync-HistoryModelName $configuredHistorySheet $config }
                finally { Release-ComObjectSafe $configuredHistorySheet }
            }
            Update-Dashboard $tracker $config $watches $importedAny
            Update-RankMatrix $tracker $config $watches 'NaturalRank'
            Update-RankMatrix $tracker $config $watches 'SPRank'
            Update-ABAMonthly $tracker $config $watches
        }
    }
    else {
        Write-Host '没有新增日报或星标变化，已跳过看板、矩阵和ABA月度重算。'
    }
    Update-WorkbookNavigation $tracker $configs
    $tracker.Save()
    Write-Host ("完成：发现 {0} 个源文件；新处理 {1} 个；跳过 {2} 个。" -f $files.Count, $pendingFiles.Count, $skippedFiles.Count)
    Write-Host "备份：$backupPath"
}
finally {
    if ($null -ne $tracker) { try { $tracker.Close($false) } catch {} }
    if ($null -ne $app) { try { $app.Quit() } catch {} }
    Release-ComObjectSafe $tracker
    Release-ComObjectSafe $app
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

if (-not $NoPause) {
    Write-Host ''
    Read-Host '按 Enter 键关闭'
}
