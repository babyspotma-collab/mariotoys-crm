@echo off
rem Lance le programme local a la main (fenetre visible, Ctrl+C pour arreter).
rem Les logs sont aussi dans logs\worker.log.
chcp 65001 >nul
cd /d "%~dp0"
if not exist "venv\Scripts\python.exe" (
    echo venv introuvable. Voir README.md, section Installation.
    pause
    exit /b 1
)
if not exist ".env" (
    echo Fichier .env introuvable : copier .env.example en .env et le remplir.
    pause
    exit /b 1
)
"venv\Scripts\python.exe" main.py
echo.
echo Programme arrete (code %errorlevel%).
pause
