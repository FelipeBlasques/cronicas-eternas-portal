@echo off
rem Cria o zip da pasta portal para mandar ao servidor.
rem Uso: empacotar 10   (gera portal-atualizacao-10.zip nesta pasta)
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  echo Use: empacotar NUMERO   por exemplo: empacotar 10
  exit /b 1
)
set "ARQUIVO=portal-atualizacao-%~1.zip"
if exist "%ARQUIVO%" del "%ARQUIVO%"
tar -a -cf "%ARQUIVO%" portal
if errorlevel 1 (
  echo Nao foi possivel criar o zip.
  exit /b 1
)
echo Pronto: %ARQUIVO%
echo No servidor: unzip -o /root/%ARQUIVO% -d /opt ^&^& systemctl restart portal
