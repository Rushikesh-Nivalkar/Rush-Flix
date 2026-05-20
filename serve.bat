@echo off
title Rush Flix — Local Server
color 0A

echo.
echo  ██████╗ ██╗   ██╗███████╗██╗  ██╗    ███████╗██╗     ██╗██╗  ██╗
echo  ██╔══██╗██║   ██║██╔════╝██║  ██║    ██╔════╝██║     ██║╚██╗██╔╝
echo  ██████╔╝██║   ██║███████╗███████║    █████╗  ██║     ██║ ╚███╔╝
echo  ██╔══██╗██║   ██║╚════██║██╔══██║    ██╔══╝  ██║     ██║ ██╔██╗
echo  ██║  ██║╚██████╔╝███████║██║  ██║    ██║     ███████╗██║██╔╝ ██╗
echo  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝     ╚══════╝╚═╝╚═╝  ╚═╝
echo.
echo  Starting Rush Flix server...
echo  ─────────────────────────────────────────────────────────────────
echo.
echo  On your Chromecast / Google TV / Android TV / Fire TV:
echo    1. Open the browser
echo    2. Navigate to the Network URL shown below (e.g. http://192.168.x.x:4173)
echo.
echo  To add your TMDB token via phone:
echo    Scan the QR code shown on the setup screen
echo    OR go to  http://[your-ip]:4173/?setup=phone  on your phone
echo.
echo  ─────────────────────────────────────────────────────────────────
echo.

cd /d "%~dp0"
npm run serve

pause
