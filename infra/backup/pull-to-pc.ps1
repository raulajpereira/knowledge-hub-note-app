# Copies the VPS backups (infra/backup/local-backup.sh) to this Windows PC
# and checks each one against its .sha256. Only new archives are fetched;
# old ones on the PC are kept (delete them by hand when you like).
# Needs the SSH key set up once (docs/DEPLOY.md §6). Run by hand or weekly
# from the Task Scheduler:
#   powershell -ExecutionPolicy Bypass -File pull-to-pc.ps1 -Vps root@<IP-da-VPS>
param(
  [Parameter(Mandatory = $true)][string]$Vps,
  [string]$Dest = "$HOME\Documents\KnowledgeHub-backups",
  [string]$RemoteDir = "/var/backups/knowledgehub"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$log = Join-Path $Dest "copias.log"
function Log($m) { $l = "$(Get-Date -Format s)  $m"; Write-Host $l; Add-Content -Path $log -Value $l }

$remote = ssh -o BatchMode=yes $Vps "ls -1 $RemoteDir/*.7z 2>/dev/null"
if ($LASTEXITCODE -ne 0) { Log "ERRO: sem ligacao a $Vps (chave SSH?)"; exit 1 }
$new = 0
foreach ($path in ($remote -split "`n" | Where-Object { $_ })) {
  $name = Split-Path $path -Leaf
  $local = Join-Path $Dest $name
  if (Test-Path $local) { continue }
  scp -q -o BatchMode=yes "${Vps}:$path" "${Vps}:$path.sha256" "$Dest\"
  $want = ((Get-Content "$local.sha256") -split '\s+')[0].ToLower()
  $got = (Get-FileHash $local -Algorithm SHA256).Hash.ToLower()
  if ($want -ne $got) { Log "ERRO: $name chegou corrompido (sha256 diferente) - apagado, tenta de novo"; Remove-Item $local; exit 1 }
  Log "OK  $name ($([math]::Round((Get-Item $local).Length / 1MB, 1)) MB)"
  $new++
}
if ($new -eq 0) { Log "Nada de novo." }
