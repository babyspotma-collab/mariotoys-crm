# Lance le vrai Chrome (pas le Chromium de Playwright) avec le debugging
# distant active, sur un profil dedie separe de ton profil Chrome
# principal.
#
# Pourquoi un profil separe : Chrome refuse --remote-debugging-port sur
# le dossier "User Data" par defaut (protection ajoutee par Google pour
# empecher justement ce genre d'attache a distance sur un vrai profil) -
# il faut donc un --user-data-dir distinct. Premiere fois : connecte-toi
# manuellement a ton compte Google secondaire dans la fenetre qui
# s'ouvre, la session sera ensuite conservee dans chrome-profile/.
#
# Usage : clic droit > "Executer avec PowerShell", ou depuis un terminal :
#   powershell -ExecutionPolicy Bypass -File .\start_chrome.ps1

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profileDir = Join-Path $PSScriptRoot "chrome-profile"

if (-not (Test-Path $chromePath)) {
    Write-Host "Chrome introuvable a $chromePath - ajuste le chemin dans ce script." -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

Write-Host "Lancement de Chrome (profil dedie, debugging sur le port 9222)..." -ForegroundColor Cyan
& $chromePath `
    --remote-debugging-port=9222 `
    --user-data-dir="$profileDir" `
    --no-first-run `
    --no-default-browser-check `
    "https://gemini.google.com/app"

Write-Host "Chrome ferme." -ForegroundColor Cyan
