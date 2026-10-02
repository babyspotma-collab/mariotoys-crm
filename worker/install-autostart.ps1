# Enregistre le programme local comme tache planifiee Windows : demarrage a
# l'ouverture de session, sans fenetre (pythonw.exe), relance automatique.
#
# NON EXECUTE PAR DEFAUT - a lancer seulement quand le programme est valide :
#   powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1
#   powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1 -Remove   (desinstaller)
#
# Necessite un PowerShell administrateur (Register-ScheduledTask echoue
# sinon). Fichier volontairement sans accents (PowerShell 5.1 lit les .ps1
# en ANSI).
param([switch]$Remove)

$taskName = "MarioToysWorker"
$oldTaskName = "MarioToysImagesWorker"   # ancien programme (mariotoys-images-automation)
$projectDir = $PSScriptRoot
$pythonw = Join-Path $projectDir "venv\Scripts\pythonw.exe"
$mainScript = Join-Path $projectDir "main.py"

if ($Remove) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Write-Host "ECHEC : la tache existe encore (PowerShell administrateur requis ?)." -ForegroundColor Red
        exit 1
    }
    Write-Host "Tache '$taskName' supprimee." -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $pythonw)) {
    Write-Host "pythonw.exe introuvable a $pythonw - le venv est-il installe ? (voir README.md)" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $projectDir ".env"))) {
    Write-Host "Fichier .env introuvable : copier .env.example en .env et le remplir." -ForegroundColor Red
    exit 1
}

# Deux programmes ne doivent jamais tourner ensemble (ils se disputeraient
# les jobs et la session Gemini).
$old = Get-ScheduledTask -TaskName $oldTaskName -ErrorAction SilentlyContinue
if ($old -and $old.State -ne "Disabled") {
    Write-Host "ATTENTION : l'ancienne tache '$oldTaskName' est active sur ce PC." -ForegroundColor Yellow
    Write-Host "Desactive-la avant : Disable-ScheduledTask -TaskName '$oldTaskName'" -ForegroundColor Yellow
}

$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$mainScript`"" -WorkingDirectory $projectDir
# Ouverture de session + toutes les 5 minutes : si le programme est mort
# (veille, plantage) il est relance ; s'il tourne, IgnoreNew ne fait rien
# (le verrou de port empeche de toute facon un 2e programme).
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$triggerRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -Hidden `
    -DontStopOnIdleEnd

try {
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger @($triggerLogon, $triggerRepeat) `
        -Settings $settings `
        -Description "Mario Toys CRM - programme local (Creatives + Creation produits, Gemini web)" `
        -Force -ErrorAction Stop | Out-Null
} catch {
    Write-Host "ECHEC : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Relancer ce script depuis un PowerShell administrateur." -ForegroundColor Yellow
    exit 1
}

# Verifie que la tache existe vraiment (deja vu un echec silencieux).
if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
    Write-Host "ECHEC : la tache n'a pas ete creee (verification apres coup)." -ForegroundColor Red
    exit 1
}

Write-Host "Tache planifiee '$taskName' enregistree." -ForegroundColor Green
Write-Host "Lancer tout de suite : Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Etat                 : Get-ScheduledTask -TaskName '$taskName' | Get-ScheduledTaskInfo"
Write-Host "Desactiver           : Disable-ScheduledTask -TaskName '$taskName'"
Write-Host "Logs                 : $projectDir\logs\worker.log"
