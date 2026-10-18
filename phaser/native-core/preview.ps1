param([int]$Port=5175)
$ErrorActionPreference='Stop'
if($Port -lt 1 -or $Port -gt 65535){throw 'Invalid port'}
$webRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$manifestPath=Join-Path $PSScriptRoot 'dist/build-manifest.json'
$manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
foreach($item in $manifest.files.PSObject.Properties){
    $file=Join-Path (Join-Path $PSScriptRoot 'dist') $item.Name
    if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.Value){throw "Build mismatch: $($item.Name). Run node phaser/native-core/build.mjs"}
}
$expected=(Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$url="http://127.0.0.1:$Port/"
function Test-Preview {
    try {
        $response=Invoke-WebRequest -Uri ($url+'build-manifest.json') -UseBasicParsing -TimeoutSec 2
        $response.RawContentStream.Position=0
        $hasher=[System.Security.Cryptography.SHA256]::Create()
        try{$actual=[BitConverter]::ToString($hasher.ComputeHash($response.RawContentStream)).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
        return $actual -eq $expected
    }catch{return $false}
}
if(@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count){
    if(-not (Test-Preview)){throw "Port $Port serves another build; no process was changed"}
    Write-Output "Verified Phaser original-core preview: $url";exit 0
}
$nodeExe=(Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
$env:PORT=[string]$Port;$env:HOST='127.0.0.1';$env:STATIC_ROOT=Join-Path $PSScriptRoot 'dist'
$server=Start-Process -FilePath $nodeExe -ArgumentList @('tools/serve.mjs') -WorkingDirectory $webRoot -WindowStyle Hidden -PassThru
for($attempt=0;$attempt -lt 30;$attempt++){
    if($server.HasExited){throw 'Preview server exited'}
    if(Test-Preview){Write-Output "Verified Phaser original-core preview: $url (PID $($server.Id))";exit 0}
    Start-Sleep -Milliseconds 200
}
throw "Preview not ready; owned PID $($server.Id)"
