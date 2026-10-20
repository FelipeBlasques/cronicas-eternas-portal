@echo off
rem Roda o portal neste PC para testar, com dados de teste na pasta dados-teste.
rem Precisa do Node 22 ou mais novo (nodejs.org). Depois de iniciar, abra
rem http://127.0.0.1:3000 no navegador. Para parar, feche esta janela ou aperte Ctrl+C.
rem Na primeira vez, a senha da conta "mestre" aparece logo abaixo.
setlocal
cd /d "%~dp0"
set "DADOS=%~dp0dados-teste"
set "FOUNDRY_DADOS=%~dp0dados-teste\foundry"
set "COOKIE_SEGURO=nao"
set "PORTA=3000"
node portal\servidor.js
pause
