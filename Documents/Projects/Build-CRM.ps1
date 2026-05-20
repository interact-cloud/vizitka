# ============================================================
# CRM Builder для MLM-структуры
# Версия: 1.0  |  Дата: 2026-05-14
# Источники: 4 xlsx-файла с рабочего стола
# Фильтр: Уровень=1 AND Ранг=ПК
# ============================================================

Set-StrictMode -Off
$ErrorActionPreference = "SilentlyContinue"

$DesktopPath = "C:\Users\Administrator\Desktop"
$ProjectPath  = "C:\Users\Administrator\Documents\Projects"
$DateStamp    = Get-Date -Format "yyyy-MM-dd"
$OutFileName  = "CRM_База_MLM_$DateStamp.xlsx"

# Цвета (BGR для Excel COM)
$clrBlueHeader  = 0xC47244   # синий заголовок главного листа (BGR)
$clrGreenHeader = 0x47AD70
$clrOrangeHdr   = 0x1F77C4
$clrRedHdr      = 0x3333CC
$clrYellowHdr   = 0x00CCFF
$clrRowEven     = 0xF1E6DC
$clrRowOdd      = 0xFFFFFF
$clrMissing     = 0xCCCCFF   # подсветка пустых обязательных полей
$clrHighBonus   = 0xCCFFCC   # высокий бонус

# ============================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================================

function Format-Phone {
    param([string]$raw)
    if (-not $raw) { return "" }
    # Убираем "7|" формат файла 1 ("7|9883139653")
    $raw = $raw -replace '7\|', '' -replace '\|', ''
    # Оставляем только цифры
    $digits = $raw -replace '\D', ''
    if ($digits.Length -eq 11 -and $digits[0] -eq '7') { $digits = $digits.Substring(1) }
    if ($digits.Length -eq 10) {
        return "+7 ($($digits.Substring(0,3))) $($digits.Substring(3,3))-$($digits.Substring(6,2))-$($digits.Substring(8,2))"
    }
    return $raw.Trim()
}

function Format-Email {
    param([string]$raw)
    if (-not $raw) { return "" }
    return $raw.Trim().ToLower()
}

function Extract-RegMonth {
    param([string]$note)
    $pattern = "(Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь)\s+(\d{4})"
    if ($note -match $pattern) { return "$($Matches[1]) $($Matches[2])" }
    return ""
}

function Split-FIO {
    param([string]$fio)
    $parts = $fio.Trim() -split '\s+', 2
    if ($parts.Count -ge 2) { return $parts[0], $parts[1] }
    if ($parts.Count -eq 1) { return $parts[0], "" }
    return "", ""
}

function Parse-Balance {
    param([string]$raw)
    if (-not $raw) { return [decimal]0 }
    if ($raw -match 'Kč|€|£|\$|CHF|UAH') { return $null }  # иностранная валюта — исключить
    # Убираем всё кроме цифр и запятой (запятая = десятичный разделитель в рублях)
    $n = $raw -replace '[^\d,]', '' -replace ',', '.'
    $n = $n.TrimEnd('.')
    try { return [decimal]$n } catch { return [decimal]0 }
}

function Parse-Decimal {
    param([string]$raw)
    if (-not $raw) { return [decimal]0 }
    $n = $raw -replace ',', '.' -replace '[^\d.]', ''
    try { return [decimal]$n } catch { return [decimal]0 }
}

function Set-HeaderStyle {
    param($ws, [int]$cols, [long]$bgColor)
    $rng = $ws.Range($ws.Cells.Item(1,1), $ws.Cells.Item(1,$cols))
    $rng.Font.Bold      = $true
    $rng.Font.Size      = 11
    $rng.Interior.Color = $bgColor
    $rng.Font.Color     = 0xFFFFFF
    $rng.RowHeight      = 30
    $rng.VerticalAlignment   = -4108  # xlCenter
    $rng.HorizontalAlignment = -4108
    $rng.WrapText = $true
}

function Write-HeaderRow {
    param($ws, [string[]]$headers, [long]$bgColor)
    for ($c = 0; $c -lt $headers.Count; $c++) {
        $ws.Cells.Item(1, $c+1).Value2 = $headers[$c]
    }
    Set-HeaderStyle $ws $headers.Count $bgColor
}

function Add-AutoFilter {
    param($ws, [int]$cols)
    $ws.Range($ws.Cells.Item(1,1), $ws.Cells.Item(1,$cols)).AutoFilter() | Out-Null
}

# ============================================================
# PHASE 1: ЧИТАЕМ ФАЙЛЫ
# ============================================================
Write-Host "`n[1/6] Инициализация Excel..." -ForegroundColor Cyan
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false

# ---------- ФАЙЛ 1: Информационный отчёт ----------
Write-Host "[2/6] Читаю Информационный отчёт (фильтр: Уровень=1 AND Ранг=ПК)..." -ForegroundColor Cyan
$wb1 = $xl.Workbooks.Open("$DesktopPath\Информационный отчет.xlsx", 0, $true)
$ws1 = $wb1.Sheets.Item(1)

$clients = [ordered]@{}   # RegNum -> hashtable с данными

for ($r = 2; $r -le $ws1.UsedRange.Rows.Count; $r++) {
    $level = $ws1.Cells.Item($r,  2).Text.Trim()
    $rank  = $ws1.Cells.Item($r, 14).Text.Trim()
    if ($level -ne "1" -or $rank -ne "ПК") { continue }

    $regNum = $ws1.Cells.Item($r, 1).Text.Trim()
    if (-not $regNum) { continue }
    if ($clients.Contains($regNum)) { continue }  # дубль — берём первый

    $fio = $ws1.Cells.Item($r, 3).Text.Trim()
    $fam, $imya = Split-FIO $fio

    $phoneRaw = $ws1.Cells.Item($r, 5).Text.Trim()
    $note     = $ws1.Cells.Item($r,17).Text.Trim()

    $clients[$regNum] = [ordered]@{
        RegNum            = $regNum
        Фамилия           = $fam
        Имя               = $imya
        Отчество          = ""
        ДатаРождения      = $ws1.Cells.Item($r, 8).Text.Trim()
        Email             = Format-Email ($ws1.Cells.Item($r, 4).Text.Trim())
        Телефон           = Format-Phone $phoneRaw
        Ранг              = $rank
        ЛОraw             = $ws1.Cells.Item($r, 9).Text.Trim()  # копируем без изменений
        ЦОК               = $ws1.Cells.Item($r,16).Text.Trim()
        Примечание        = $note
        # Заполнится из файла 2
        Город             = ""
        АдресЦОК          = ""
        СтатусПодарка     = ""
        Выполнено50       = ""
        ВКлубе            = $false
        # Заполнится из файлов 3/4
        БалансRaw         = ""  # копируем без изменений
        ПоследняяПокупка  = ""  # копируем из File 4 Column F без изменений
        # Помесячные баллы (файл 2, 13 месяцев)
        M05_2026=""; M04_2026=""; M03_2026=""; M02_2026=""; M01_2026=""
        M12_2025=""; M11_2025=""; M10_2025=""; M09_2025=""
        M08_2025=""; M07_2025=""; M06_2025=""; M05_2025=""
    }
}
$wb1.Close($false)
Write-Host "   → Загружено: $($clients.Count) клиентов (ПК уровень 1)" -ForegroundColor Green

# ---------- ФАЙЛ 2: Клуб Постоянства (заголовок стр.6, данные с стр.7) ----------
Write-Host "[3/6] Читаю Клуб Постоянства..." -ForegroundColor Cyan
$wb2 = $xl.Workbooks.Open("$DesktopPath\Клуб Постоянства.xlsx", 0, $true)
$ws2 = $wb2.Sheets.Item(1)

# Столбцы 11-23 = месяцы (05.2026 → 05.2025)
$monthMap = @{11="M05_2026";12="M04_2026";13="M03_2026";14="M02_2026";15="M01_2026"
              16="M12_2025";17="M11_2025";18="M10_2025";19="M09_2025"
              20="M08_2025";21="M07_2025";22="M06_2025";23="M05_2025"}

$cnt2 = 0
for ($r = 7; $r -le $ws2.UsedRange.Rows.Count; $r++) {
    $regNum = $ws2.Cells.Item($r, 1).Text.Trim()
    if (-not $regNum -or -not $clients.Contains($regNum)) { continue }
    $c = $clients[$regNum]

    # Контактные данные — заполняем только пустые
    $p2 = Format-Phone ($ws2.Cells.Item($r,4).Text.Trim())
    $e2 = Format-Email ($ws2.Cells.Item($r,5).Text.Trim())
    if (-not $c.Телефон -and $p2)   { $c.Телефон = $p2 }
    if (-not $c.Email   -and $e2)   { $c.Email   = $e2 }
    $db2 = $ws2.Cells.Item($r,3).Text.Trim()
    if (-not $c.ДатаРождения -and $db2) { $c.ДатаРождения = $db2 }
    $цок2 = $ws2.Cells.Item($r,6).Text.Trim()
    if (-not $c.ЦОК -and $цок2) { $c.ЦОК = $цок2 }

    $c.Город         = $ws2.Cells.Item($r,7).Text.Trim()
    $c.АдресЦОК      = $ws2.Cells.Item($r,8).Text.Trim()
    $c.СтатусПодарка = $ws2.Cells.Item($r,9).Text.Trim()
    $c.Выполнено50   = $ws2.Cells.Item($r,10).Text.Trim()
    $c.ВКлубе        = $true

    foreach ($colIdx in $monthMap.Keys) {
        $val = $ws2.Cells.Item($r, $colIdx).Text.Trim()
        if ($val -and $val -ne "0") { $c[$monthMap[$colIdx]] = $val }
    }
    $cnt2++
}
$wb2.Close($false)
Write-Host "   → Сопоставлено с Клубом Постоянства: $cnt2" -ForegroundColor Green

# ---------- ФАЙЛ 3: Отчёты по бонусам ----------
Write-Host "[4/6] Читаю Отчёты по бонусам..." -ForegroundColor Cyan
$wb3 = $xl.Workbooks.Open("$DesktopPath\отчеты по бонусам.xlsx", 0, $true)
$ws3 = $wb3.Sheets.Item(1)

$cnt3 = 0
for ($r = 2; $r -le $ws3.UsedRange.Rows.Count; $r++) {
    $regNum = $ws3.Cells.Item($r,1).Text.Trim()
    if (-not $regNum -or -not $clients.Contains($regNum)) { continue }
    $balRaw = $ws3.Cells.Item($r,3).Text.Trim()
    if ($balRaw -match 'Kč|€|£|\$|CHF|UAH') { continue }  # иностранная валюта
    if ($balRaw -and -not $clients[$regNum].БалансRaw) {
        $clients[$regNum].БалансRaw = $balRaw
        $cnt3++
    }
}
$wb3.Close($false)
Write-Host "   → Баланс добавлен: $cnt3" -ForegroundColor Green

# ---------- ФАЙЛ 4: Привилегированные клиенты ----------
Write-Host "[5/6] Читаю Привилегированные клиенты..." -ForegroundColor Cyan
$wb4 = $xl.Workbooks.Open("$DesktopPath\Привилегированные_клиенты_для_срочного_контакта.xlsx", 0, $true)
$ws4 = $wb4.Sheets.Item(1)

$cnt4 = 0
for ($r = 2; $r -le $ws4.UsedRange.Rows.Count; $r++) {
    $regNum = $ws4.Cells.Item($r,1).Text.Trim()
    if (-not $regNum -or -not $clients.Contains($regNum)) { continue }
    $c = $clients[$regNum]

    $lp = $ws4.Cells.Item($r,6).Text.Trim()
    if ($lp) { $c.ПоследняяПокупка = $lp }

    $bonus4 = Parse-Decimal ($ws4.Cells.Item($r,7).Text.Trim())
    if ($bonus4 -gt 0) { $c.БонусныйСчет = $bonus4 }  # файл 4 приоритетнее

    $p4 = Format-Phone ($ws4.Cells.Item($r,4).Text.Trim())
    $e4 = Format-Email ($ws4.Cells.Item($r,5).Text.Trim())
    if (-not $c.Телефон -and $p4) { $c.Телефон = $p4 }
    if (-not $c.Email   -and $e4) { $c.Email   = $e4 }
    $db4 = $ws4.Cells.Item($r,3).Text.Trim()
    if (-not $c.ДатаРождения -and $db4) { $c.ДатаРождения = $db4 }

    $cnt4++
}
$wb4.Close($false)
Write-Host "   → Обновлено из Привилегированных: $cnt4" -ForegroundColor Green

# ============================================================
# PHASE 2: ФОРМИРУЕМ ВЫХОДНОЙ ФАЙЛ
# ============================================================
Write-Host "[6/6] Создаю Excel CRM-файл..." -ForegroundColor Cyan

$wbOut = $xl.Workbooks.Add()
# Удаляем лишние листы (оставляем 1)
while ($wbOut.Sheets.Count -gt 1) { $wbOut.Sheets.Item($wbOut.Sheets.Count).Delete() }

# ============================================================
# ЛИСТ 1: CRM (главная база)
# ============================================================
$wsCRM = $wbOut.Sheets.Item(1)
$wsCRM.Name = "CRM"
$wsCRM.Tab.Color = 0xC47244

$crmHeaders = @(
    "Фамилия","Имя","Отчество","Дата рождения","Рег. номер",
    "Email","Телефон","Адрес ЦОК","Последняя покупка","Ранг",
    "ЛО (баллы)","Баланс","ЦОК","Город",
    "Статус подарка","50 баллов выполнено",
    "05.2026","04.2026","03.2026","02.2026","01.2026",
    "12.2025","11.2025","10.2025","09.2025","08.2025","07.2025","06.2025","05.2025"
)
Write-HeaderRow $wsCRM $crmHeaders 0xC47244

$monthKeys = @("M05_2026","M04_2026","M03_2026","M02_2026","M01_2026",
               "M12_2025","M11_2025","M10_2025","M09_2025",
               "M08_2025","M07_2025","M06_2025","M05_2025")

$sorted = $clients.Values | Sort-Object { $_.Фамилия }
$row = 2
foreach ($c in $sorted) {
    $bg = if ($row % 2 -eq 0) { 0xF1E6DC } else { 0xFFFFFF }

    $wsCRM.Cells.Item($row, 1).Value2  = $c.Фамилия
    $wsCRM.Cells.Item($row, 2).Value2  = $c.Имя
    $wsCRM.Cells.Item($row, 3).Value2  = $c.Отчество
    $wsCRM.Cells.Item($row, 4).Value2  = $c.ДатаРождения
    $wsCRM.Cells.Item($row, 5).Value2  = $c.RegNum
    $wsCRM.Cells.Item($row, 6).Value2  = $c.Email
    $wsCRM.Cells.Item($row, 7).Value2  = $c.Телефон
    $wsCRM.Cells.Item($row, 8).Value2  = $c.АдресЦОК
    $wsCRM.Cells.Item($row, 9).Value2  = $c.ПоследняяПокупка
    $wsCRM.Cells.Item($row, 10).Value2 = $c.Ранг
    $wsCRM.Cells.Item($row, 11).Value2 = $c.ЛОraw
    $wsCRM.Cells.Item($row, 12).Value2 = $c.БалансRaw
    $wsCRM.Cells.Item($row, 13).Value2 = $c.ЦОК
    $wsCRM.Cells.Item($row, 14).Value2 = $c.Город
    $wsCRM.Cells.Item($row, 15).Value2 = $c.СтатусПодарка
    $wsCRM.Cells.Item($row, 16).Value2 = $c.Выполнено50

    for ($mi = 0; $mi -lt $monthKeys.Count; $mi++) {
        $val = $c[$monthKeys[$mi]]
        if ($val -and $val -ne "0") {
            $wsCRM.Cells.Item($row, 17 + $mi).Value2 = $val
        }
    }

    # Цвет строки
    $rng = $wsCRM.Range("A$row:AD$row")
    $rng.Interior.Color = $bg

    # Подсветка пустых обязательных полей
    foreach ($col in @(6,7)) {  # Email, Телефон
        if (-not $wsCRM.Cells.Item($row, $col).Value2) {
            $wsCRM.Cells.Item($row, $col).Interior.Color = 0xCCCCFF
        }
    }

    $row++
}

$wsCRM.Columns.AutoFit() | Out-Null
Add-AutoFilter $wsCRM $crmHeaders.Count

# Заморозка первой строки
$xl.ActiveWindow.SplitRow = 1
$xl.ActiveWindow.FreezePanes = $true

$totalCRM = $row - 2
Write-Host "   → CRM: $totalCRM строк записано" -ForegroundColor Green

# ============================================================
# СОХРАНЕНИЕ
# ============================================================
# ============================================================
# ИТОГОВАЯ СТАТИСТИКА (строка над главной таблицей)
# ============================================================
$wsCRM.Activate() | Out-Null

# Сводка над таблицей
$wsCRM.Cells.Item(1, $crmHeaders.Count + 2).Value2 = "Обновлено:"
$wsCRM.Cells.Item(1, $crmHeaders.Count + 3).Value2 = $DateStamp
$wsCRM.Cells.Item(1, $crmHeaders.Count + 2).Font.Bold = $true

# ============================================================
# СОХРАНЕНИЕ
# ============================================================
$pathDesktop = "$DesktopPath\$OutFileName"
$pathProject = "$ProjectPath\$OutFileName"

$wbOut.SaveAs($pathDesktop, 51)   # 51 = xlOpenXMLWorkbook (.xlsx)
$wbOut.SaveAs($pathProject, 51)
$wbOut.Close($false)

$xl.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($xl) | Out-Null
[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers()

# ============================================================
# ОТЧЁТ
# ============================================================
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "  CRM-БАЗА СОЗДАНА УСПЕШНО" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Всего клиентов (ПК уровень 1): $totalCRM"
Write-Host "  В Клубе Постоянства:            $cnt2"
Write-Host "  С бонусным счётом (файл 3):     $cnt3"
Write-Host "  Обновлено из файла 4:            $cnt4"
Write-Host ""
Write-Host "  Файл сохранён:" -ForegroundColor Yellow
Write-Host "    $pathDesktop"
Write-Host "    $pathProject"
Write-Host "============================================`n" -ForegroundColor Cyan
