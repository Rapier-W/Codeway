param(
  [string]$OutputDirectory = './backups',
  [string]$Container = 'tongluxing-postgres'
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $OutputDirectory "tongluxing-$stamp.sql"
docker exec $Container pg_dump -U tongluxing -d tongluxing | Out-File -Encoding utf8 -FilePath $target
Write-Output "Backup written to $target"
