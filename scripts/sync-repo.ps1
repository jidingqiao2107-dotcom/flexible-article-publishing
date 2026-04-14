param(
  [switch]$Watch,
  [int]$DebounceSeconds = 8,
  [string]$Message,
  [string]$Branch = ""
)

$ErrorActionPreference = "Stop"

function Find-GitExecutable {
  $candidates = @(
    (Get-Command git -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source),
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files\Git\bin\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\bin\git.exe"
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "Git executable was not found. Install Git for Windows or add git.exe to PATH."
}

function Invoke-Git {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args
  )

  & $script:GitExe @Args
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Args -join ' ') failed with exit code $LASTEXITCODE."
  }
}

function Get-GitOutput {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args
  )

  $output = & $script:GitExe @Args 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Args -join ' ') failed with exit code $LASTEXITCODE.`n$output"
  }

  return ($output | Out-String).Trim()
}

function Resolve-Branch {
  if ($Branch) {
    return $Branch
  }

  return Get-GitOutput -Args @("rev-parse", "--abbrev-ref", "HEAD")
}

function Sync-Repo {
  $branchName = Resolve-Branch
  $status = Get-GitOutput -Args @("status", "--porcelain")

  if (-not $status) {
    Write-Host "No changes to sync."
    return
  }

  Invoke-Git -Args @("add", "-A")

  $postAddStatus = Get-GitOutput -Args @("status", "--porcelain")
  if (-not $postAddStatus) {
    Write-Host "No trackable changes to sync."
    return
  }

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $commitMessage = if ($Message) { $Message } else { "chore(sync): auto-upload $timestamp" }

  Invoke-Git -Args @("commit", "-m", $commitMessage)
  Invoke-Git -Args @("push", "origin", "HEAD:$branchName")
  Write-Host "Synced local changes to origin/$branchName at $timestamp."
}

$script:GitExe = Find-GitExecutable

if (-not $Watch) {
  Sync-Repo
  exit 0
}

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = (Get-Location).Path
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite, DirectoryName, CreationTime'
$watcher.Filter = "*"

$script:lastEventAt = Get-Date "2000-01-01"
$script:isSyncRunning = $false
$script:timer = New-Object System.Timers.Timer
$script:timer.Interval = [Math]::Max($DebounceSeconds, 2) * 1000
$script:timer.AutoReset = $false

$syncAction = {
  if ($script:isSyncRunning) {
    return
  }

  $script:isSyncRunning = $true
  try {
    Sync-Repo
  } catch {
    Write-Host $_.Exception.Message
  } finally {
    $script:isSyncRunning = $false
  }
}

$eventAction = {
  $path = $Event.SourceEventArgs.FullPath
  if ($path -match '\\\.git(\\|$)' -or $path -match '\\node_modules(\\|$)' -or $path -match '\\\.next(\\|$)') {
    return
  }

  $script:lastEventAt = Get-Date
  $script:timer.Stop()
  $script:timer.Start()
}

Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $eventAction | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Created -Action $eventAction | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Deleted -Action $eventAction | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action $eventAction | Out-Null
Register-ObjectEvent -InputObject $script:timer -EventName Elapsed -Action $syncAction | Out-Null

Write-Host "Watching for local changes. Press Ctrl+C to stop."
while ($true) {
  Start-Sleep -Seconds 1
}
