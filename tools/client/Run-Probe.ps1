#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$RequestFile,
 [Parameter(Mandatory)][string]$GameExe,
 [Parameter(Mandatory)][string]$Profile,
 [Parameter(Mandatory)][string]$CommonJ,
 [Parameter(Mandatory)][string]$BlizzardJ,
 [Parameter(Mandatory)][string]$TelemetryRoot,
 [Parameter(Mandatory)][string]$OutputDirectory,
 [string]$ReplayDirectory,
 [ValidateRange(20,600)][int]$TimeoutSeconds=180,
 [switch]$StopOwnedProcess
)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'Requires the actual Windows game client; no mock fallback'}
if(-not [Environment]::UserInteractive){throw 'Requires an interactive logged-in desktop'}
function Safe([string]$value,[bool]$file=$false){
 $full=[IO.Path]::GetFullPath($value);$p=$full
 while($p){if(Test-Path -LiteralPath $p){$i=Get-Item -LiteralPath $p -Force;if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Reparse point refused: $p"}};$next=[IO.Path]::GetDirectoryName($p);if($next -eq $p){break};$p=$next}
 if($file){$i=Get-Item -LiteralPath $full;if($i.PSIsContainer){throw 'Expected file'}};return $full
}
function Hash([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
$GameExe=Safe $GameExe $true;$RequestFile=Safe $RequestFile $true;$Profile=Safe $Profile $true
$CommonJ=Safe $CommonJ $true;$BlizzardJ=Safe $BlizzardJ $true;$TelemetryRoot=Safe $TelemetryRoot;$OutputDirectory=Safe $OutputDirectory
if(Test-Path -LiteralPath $OutputDirectory){throw 'Output directory must be NEW'}
if((Get-Item $RequestFile).Length -gt 16384 -or (Get-Item $Profile).Length -gt 16777216){throw 'Oversized configuration'}
$request=Get-Content -Raw -LiteralPath $RequestFile|ConvertFrom-Json;$pin=Get-Content -Raw -LiteralPath $Profile|ConvertFrom-Json
if($request.kind -ne 'wc3-pathing-probe' -or $request.nonce -notmatch '^[a-f0-9]{32}$' -or $request.map -ne 'probe.w3x'){throw 'Invalid request'}
$map=Safe (Join-Path (Split-Path $RequestFile) 'probe.w3x') $true
if((Hash $map) -ne $request.mapSha256){throw 'Map hash mismatch'}
if($pin.kind -ne 'wc3-game-profile' -or (Hash $GameExe) -ne $pin.files.executable.sha256 -or (Hash $CommonJ) -ne $pin.files.common.sha256 -or (Hash $BlizzardJ) -ne $pin.files.blizzard.sha256){throw 'Executable or API files differ from pinned profile'}
$names=@('BOOT','FUSE'|ForEach-Object{"wc3tk-$($request.nonce)-$_.pld"})
if((@($request.files)-join ',') -ne ($names-join ',')){throw 'Invalid checkpoint paths'}
foreach($name in $names){if(Test-Path -LiteralPath (Join-Path $TelemetryRoot $name)){throw 'Stale checkpoint exists; prepare a fresh probe'}}
$node=(Get-Command node).Source;$mutex=[Threading.Mutex]::new($false,'Local\WC3ToolkitClientProbe');$locked=$false;$owned=$null;$receipt=$null;$exitCode=1
try{
 $locked=$mutex.WaitOne(0);if(-not $locked){throw 'Another toolkit probe owns the lock'}
 if(Get-Process -Name 'Warcraft III','war3' -ErrorAction SilentlyContinue){throw 'Warcraft is already running; existing sessions are left untouched'}
 New-Item -ItemType Directory -Path $OutputDirectory|Out-Null
 $start=[DateTime]::UtcNow
 $receipt=[ordered]@{schemaVersion=1;kind='wc3-client-probe';nonce=$request.nonce;startedAt=$start.ToString('o');mapSha256=(Hash $map);executableSha256=(Hash $GameExe);executableVersion=(Get-Item $GameExe).VersionInfo.FileVersion;status='STARTING';scope=$request.scope;errors=@();releaseReady=$false;artifacts=@();captureStatus='NOT_CAPTURED';replayAttribution='NOT_ESTABLISHED'}
 $psi=[Diagnostics.ProcessStartInfo]::new($GameExe);$psi.UseShellExecute=$false;$psi.WorkingDirectory=Split-Path $GameExe
 foreach($arg in @('-launch','-loadfile',$map,'-windowmode','windowed')){$psi.ArgumentList.Add($arg)}
 $owned=[Diagnostics.Process]::Start($psi);$receipt['pid']=$owned.Id;$watch=[Diagnostics.Stopwatch]::StartNew()
 while($watch.Elapsed.TotalSeconds -lt $TimeoutSeconds){
  if(@($names|Where-Object{-not(Test-Path -LiteralPath (Join-Path $TelemetryRoot $_))}).Count -eq 0){
   $raw=& $node (Join-Path $PSScriptRoot 'check-probe.cjs') $RequestFile $TelemetryRoot $start.ToString('o') 2> (Join-Path $OutputDirectory 'parser.stderr')
   $checked=$LASTEXITCODE
   if($checked -eq 0 -or $checked -eq 1){$events=($raw-join "`n")|ConvertFrom-Json;$events|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $OutputDirectory 'events.json');$receipt.status=$events.status;$exitCode=$checked;break}
  }
  $owned.Refresh();if($owned.HasExited){$receipt.status='EXITED_BEFORE_CHECKPOINTS';$receipt.errors+='A launcher handoff or early exit is not accepted as a load';break}
  Start-Sleep -Milliseconds 250
 }
 if($receipt.status -eq 'STARTING'){$receipt.status='TIMEOUT'}
 if(-not $owned.HasExited){
  $captureInfo=[Diagnostics.ProcessStartInfo]::new((Get-Process -Id $PID).Path);$captureInfo.UseShellExecute=$false
  foreach($arg in @('-NoProfile','-File',(Join-Path $PSScriptRoot 'Capture-Window.ps1'),'-TargetPid',[string]$owned.Id,'-OutputPath',(Join-Path $OutputDirectory 'client.png'))){$captureInfo.ArgumentList.Add($arg)}
  try{$capture=[Diagnostics.Process]::Start($captureInfo);if(-not $capture.WaitForExit(10000)){$capture.Kill();$receipt.errors+='Window capture timed out'}
   if(Test-Path -LiteralPath (Join-Path $OutputDirectory 'client.png')){$receipt.captureStatus='CAPTURED_UNVALIDATED';$receipt.artifacts+=@{name='client.png';sha256=(Hash (Join-Path $OutputDirectory 'client.png'))}}
  }catch{$receipt.errors+='Window capture unavailable: '+$_.Exception.Message}
 }
 foreach($name in $names){$file=Join-Path $TelemetryRoot $name;if(Test-Path -LiteralPath $file){Safe $file $true|Out-Null;if((Get-Item $file).Length -le 16384){Copy-Item -LiteralPath $file -Destination (Join-Path $OutputDirectory $name)}}}
}catch{$exitCode=1;if($receipt){$receipt.status='HARNESS_ERROR';$receipt.errors+=$_.Exception.Message}else{Write-Error $_}}
finally{
 if($StopOwnedProcess -and $owned -and -not $owned.HasExited){try{$owned.CloseMainWindow()|Out-Null;if(-not $owned.WaitForExit(5000)){$owned.Kill()}}catch{if($receipt){$receipt.errors+='Could not close the owned process'}}}
 if($receipt -and $ReplayDirectory){
  try{$ReplayDirectory=Safe $ReplayDirectory
   foreach($file in @(Get-ChildItem -LiteralPath $ReplayDirectory -File -Filter '*.w3g'|Where-Object{$_.LastWriteTimeUtc -ge $start -and $_.Length -le 134217728}|Select-Object -First 2)){
    Safe $file.FullName $true|Out-Null;Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $OutputDirectory $file.Name)
    $receipt.artifacts+=@{name=$file.Name;sha256=(Hash (Join-Path $OutputDirectory $file.Name));status='CANDIDATE_NOT_ATTRIBUTED'}
   }
  }catch{$receipt.errors+='Replay collection unavailable: '+$_.Exception.Message}
 }
 if($receipt){$receipt['endedAt']=[DateTime]::UtcNow.ToString('o');$receipt|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $OutputDirectory 'client-receipt.json')}
 if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()
}
exit $exitCode
