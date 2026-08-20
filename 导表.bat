@echo off
chcp 65001 >nul
title 文字塔防 - 导表工具
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org/zh-cn
    pause
    exit /b 1
)

if not exist "tools\node_modules" (
    echo [首次运行] 安装导表依赖...
    call npm install --prefix tools --no-fund --no-audit
)

call node tools\export_tables.js
echo.
pause
