@echo off
set ADB="%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
set DEVICE=10.10.10.85:44307

%ADB% -s %DEVICE% install -r android\app\build\outputs\apk\debug\app-debug.apk
