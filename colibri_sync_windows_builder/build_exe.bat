@echo off
python -m pip install --upgrade pip
pip install -r requirements.txt
pyinstaller --onefile --name ColibriSync colibri_sync.py
echo EXE creado en dist\ColibriSync.exe
pause
