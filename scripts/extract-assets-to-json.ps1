#Requires -Version 5.1
<#
.SYNOPSIS
  Emit resources/asset-defaults/*.json from resources/assets-legacy.js (no Node required).
  Run from repo root: powershell -ExecutionPolicy Bypass -File scripts/extract-assets-to-json.ps1
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root 'module.json'))) {
    throw "module.json not found above scripts folder. Run from repo root. Root was: $root"
}
$src = Join-Path $root 'resources\assets-legacy.js'
$outDir = Join-Path $root 'resources\asset-defaults'
if (-not (Test-Path $src)) { throw "Not found: $src" }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$text = [System.IO.File]::ReadAllText($src)

function Get-JsObjectLiteral {
    param([string]$Source, [int]$OpenBraceIndex)
    $len = $Source.Length
    $i = $OpenBraceIndex
    $depth = 0
    $inString = $false
    $esc = $false
    $start = $OpenBraceIndex
    while ($i -lt $len) {
        $c = $Source[$i]
        if ($inString) {
            if ($esc) { $esc = $false; $i++; continue }
            if ($c -eq [char]0x5C) { $esc = $true; $i++; continue }
            if ($c -eq '"') { $inString = $false }
            $i++; continue
        }
        # comments (not in string)
        if ($c -eq '/' -and ($i + 1) -lt $len) {
            $n = $Source[$i + 1]
            if ($n -eq '/') {
                $i += 2
                while ($i -lt $len -and $Source[$i] -ne "`n" -and $Source[$i] -ne "`r") { $i++ }
                continue
            }
            if ($n -eq '*') {
                $i += 2
                while ($i + 1 -lt $len) {
                    if ($Source[$i] -eq '*' -and $Source[$i + 1] -eq '/') { $i += 2; break }
                    $i++
                }
                continue
            }
        }
        if ($c -eq '"') { $inString = $true; $i++; continue }
        if ($c -eq '{') { $depth++ }
        elseif ($c -eq '}') {
            $depth--
            if ($depth -eq 0) {
                return $Source.Substring($start, $i - $start + 1)
            }
        }
        $i++
    }
    throw "Unbalanced braces starting at $OpenBraceIndex"
}

function Find-ExportObject {
    param([string]$Source, [string]$Name)
    $pat = "export const $Name = "
    $idx = $Source.IndexOf($pat)
    if ($idx -lt 0) { throw "Export not found: $Name" }
    $from = $idx + $pat.Length
    $brace = $Source.IndexOf('{', $from)
    if ($brace -lt 0) { throw "No {{ for $Name" }
    return (Get-JsObjectLiteral -Source $Source -OpenBraceIndex $brace)
}

function Remove-JsComments {
    param([string]$s)
    $sb = New-Object System.Text.StringBuilder
    $len = $s.Length
    $i = 0
    $inString = $false
    $esc = $false
    while ($i -lt $len) {
        $c = $s[$i]
        if ($inString) {
            [void]$sb.Append($c)
            if ($esc) { $esc = $false }
            elseif ($c -eq [char]0x5C) { $esc = $true }
            elseif ($c -eq '"') { $inString = $false }
            $i++
            continue
        }
        if ($c -eq '"') { $inString = $true; [void]$sb.Append($c); $i++; continue }
        if ($c -eq '/' -and ($i + 1) -lt $len) {
            $n = $s[$i + 1]
            if ($n -eq '/') {
                $i += 2
                while ($i -lt $len -and $s[$i] -ne "`n" -and $s[$i] -ne "`r") { $i++ }
                continue
            }
            if ($n -eq '*') {
                $i += 2
                while ($i + 1 -lt $len) {
                    if ($s[$i] -eq '*' -and $s[$i + 1] -eq '/') { $i += 2; break }
                    $i++
                }
                continue
            }
        }
        [void]$sb.Append($c)
        $i++
    }
    return $sb.ToString()
}

function Convert-JsLiteralToJson {
    param([string]$JsObjectText)
    $s = Remove-JsComments -s $JsObjectText
    $prev = ''
    while ($prev -ne $s) {
        $prev = $s
        $s = [regex]::Replace($s, ',(\s*[\]}])', '$1')
    }
    $null = $s | ConvertFrom-Json
    return $s
}

$exports = @(
    @{ Name = 'dataBackgroundImages'; File = 'assets-background-images.json' }
    @{ Name = 'dataIcons'; File = 'assets-icons.json' }
    @{ Name = 'dataNameplate'; File = 'assets-nameplates.json' }
    @{ Name = 'dataSounds'; File = 'assets-sounds.json' }
    @{ Name = 'dataVolume'; File = 'assets-volumes.json' }
    @{ Name = 'dataBanners'; File = 'assets-banners.json' }
    @{ Name = 'dataBackgrounds'; File = 'assets-backgrounds.json' }
    @{ Name = 'MVPTemplates'; File = 'assets-mvp-templates.json' }
)

foreach ($e in $exports) {
    $literal = Find-ExportObject -Source $text -Name $e.Name
    $inner = Convert-JsLiteralToJson -JsObjectText $literal
    $obj = $inner | ConvertFrom-Json
    $payload = [ordered]@{ manifestVersion = 1 }
    $obj.PSObject.Properties | ForEach-Object { $payload[$_.Name] = $_.Value }
    $json = $payload | ConvertTo-Json -Depth 100 -Compress:$false
    $outPath = Join-Path $outDir $e.File
    [System.IO.File]::WriteAllText($outPath, $json)
    Write-Host "Wrote resources/asset-defaults/$($e.File)"
}
Write-Host "Done."
