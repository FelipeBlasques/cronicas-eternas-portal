@echo off
rem Cria o zip da pasta portal para mandar ao servidor.
rem Pode clicar duas vezes (ele pergunta o numero) ou rodar no terminal: empacotar 10
setlocal
cd /d "%~dp0"
set "NUMERO=%~1"
if "%NUMERO%"=="" set /p "NUMERO=Numero da atualizacao (ex.: 10): "
if "%NUMERO%"=="" (
  echo Nenhum numero informado.
  goto fim
)
set "ARQUIVO=portal-atualizacao-%NUMERO%.zip"
if exist "%ARQUIVO%" del "%ARQUIVO%"
tar -a -cf "%ARQUIVO%" portal
if errorlevel 1 (
  echo Nao foi possivel criar o zip.
  goto fim
)
echo.
echo Pronto: %CD%\%ARQUIVO%
echo.
echo No servidor:
echo   unzip -o /root/%ARQUIVO% -d /opt ^&^& systemctl restart portal
:fim
echo.
pause