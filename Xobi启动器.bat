@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"

echo ========================================
echo   Xobi 一键启动（融合版）
echo ========================================
echo.
echo 说明：
echo - 这个启动器会同时启动：
echo   1) A 后端（xobixiangqing/backend，端口 5000）
echo   2) 门户前端（xobixiangqing/frontend，端口 3000）
echo   3) B 工具服务（tupian-de-tu/backend，端口 8001）
echo.

if not exist "%ROOT%xobixiangqing\启动云雾版.bat" (
  echo [Error] 找不到 %ROOT%xobixiangqing\启动云雾版.bat
  pause
  exit /b 1
)

call "%ROOT%xobixiangqing\启动云雾版.bat"

endlocal

