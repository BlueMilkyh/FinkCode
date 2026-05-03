@echo off
REM finkcode.bat - dev launcher for FinkCode (the VSCodium fork at vscode/).
REM
REM Usage:  finkcode <workdir>
REM         finkcode .              (current dir)
REM         finkcode                (no folder; FinkCode's "no workspace" UI)
REM
REM This is the dev binary path. Phase 5 will produce a real installer
REM (gulp vscode-win32-x64) and we'll switch the FinkSpace integration
REM to point at the installed exe; until then, this script bridges the
REM gap so "Open in FinkCode" buttons in FinkSpace work end-to-end.

setlocal

set "FINKCODE_REPO=%~dp0.."
set "VSCODE_DIR=%FINKCODE_REPO%\vscode"
set "EXE=%VSCODE_DIR%\.build\electron\FinkCode.exe"

if not exist "%EXE%" (
  echo [finkcode] dev binary missing: "%EXE%" 1>&2
  echo [finkcode] run scripts\code.bat from %VSCODE_DIR% once to build it. 1>&2
  exit /b 1
)

REM Resolve the requested workdir to an absolute path. If the user
REM didn't pass one, we let FinkCode show its 'no workspace' UI.
set "WORKDIR="
if not "%~1"=="" (
  for %%I in ("%~1") do set "WORKDIR=%%~fI"
)

REM Match the env vars scripts\code.bat sets so the dev binary loads
REM out/ correctly and behaves as a development build.
set "NODE_ENV=development"
set "VSCODE_DEV=1"
set "VSCODE_CLI=1"
set "ELECTRON_ENABLE_LOGGING=1"

pushd "%VSCODE_DIR%"
if defined WORKDIR (
  start "" "%EXE%" "%WORKDIR%" --disable-extension=vscode.vscode-api-tests
) else (
  start "" "%EXE%" --disable-extension=vscode.vscode-api-tests
)
popd

endlocal
