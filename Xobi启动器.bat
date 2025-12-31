@echo off
chcp 65001 >nul
title Xobi 启动中...
cd /d %~dp0backend

:: 1. 清理旧进程
taskkill /F /IM python.exe /T >nul 2>&1

:: 2. 设置 Python 路径
set PYTHON_EXE=C:\Users\Administrator\AppData\Local\Programs\Python\Python313\python.exe
if not exist "%PYTHON_EXE%" set PYTHON_EXE=python

:: 3. 启动后台服务 (在新窗口中)
:: 使用 /min 让它最小化启动，不碍眼
start "Xobi 核心服务 (请勿关闭)" /min cmd /k "%PYTHON_EXE% -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload"

:: 4. 等待并打开浏览器
timeout /t 3 >nul
start http://localhost:8001/single-antdx.html

:: 5. 自动退出启动器（只留那个核心服务窗口）
exit
