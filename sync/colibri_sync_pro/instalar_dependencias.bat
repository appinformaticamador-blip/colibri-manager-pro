@echo off
cd /d %~dp0
python --version
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
pause
