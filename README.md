# Innolab Innovation Dashboard

Az Innolab ötletállományának elemzésére, AI-alapú előszűrésére, pontozására és
rangsorolására szolgáló full-stack alkalmazás. A React frontend és a FastAPI
backend production módban ugyanarról az originről szolgálható ki.

## Követelmények

- Python 3.12+
- Node.js 20+ és npm
- Azure AI Foundry/OpenAI végpont és API-kulcs, vagy működő
  `DefaultAzureCredential`

## Telepítés Windows rendszeren

```powershell
git clone https://github.com/innohub-collab/dashboard_eles_v1.git
cd dashboard_eles_v1

python -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install --upgrade pip
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

Copy-Item backend\.env.example backend\.env
# Szerkeszd a backend\.env fájlt, és állítsd be az Azure API-kulcsot.

Set-Location frontend
npm ci
npm run build
Set-Location ..\backend

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start_production.ps1 -Port 5010
```

Ezután az alkalmazás alapértelmezetten a `http://localhost:5010` címen érhető
el. A szerver `0.0.0.0` címen figyel, ezért megfelelő tűzfalszabály és hálózati
beállítás mellett a gép LAN-címén is elérhető.

## Telepítés Linux/macOS rendszeren

```bash
git clone https://github.com/innohub-collab/dashboard_eles_v1.git
cd dashboard_eles_v1

python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements.txt
cp backend/.env.example backend/.env

cd frontend
npm ci
npm run build
cd ../backend

.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 5010
```

## Környezeti változók

A [backend/.env.example](backend/.env.example) tartalmazza a szükséges
beállítások sablonját:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_KEY`
- `RANKING_PERMISSIONS`
- `RANKING_ACTOR`

A valódi `.env` fájl nincs verziózva. API-kulcsot soha ne commitolj.

## Adatforrás

Az üzleti Excel-adatok és a lokális rangsorolási SQLite-adatbázis szándékosan
nem részei a repositorynak. Másold az Excel-riportot
`backend/data/otletek_riport.xlsx` néven a projektbe, vagy töltsd fel az
alkalmazás Beállítások oldalán. A részleteket a
[backend/data/README.md](backend/data/README.md) tartalmazza.

## Fejlesztői indítás

Backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn server:app --host 0.0.0.0 --port 8000
```

Frontend egy másik terminálban:

```powershell
cd frontend
npm start
```

A fejlesztői frontend a `http://localhost:3000`, a backend pedig a
`http://localhost:8000` címen fut.

## Tesztek

```powershell
backend\.venv\Scripts\python.exe -m pytest backend\tests

cd frontend
$env:CI = "true"
npm test -- --watchAll=false --runInBand
```

## Projektstruktúra

- `backend/` – FastAPI API, rangsorolási állapotgép, AI-integráció és tesztek
- `frontend/` – React alkalmazás és komponens-tesztek
- `backend/start_production.ps1` – Windows production indítóscript
- `backend/.env.example` – biztonságos konfigurációs sablon

Megjegyzés: a Waitress telepített függőség, de a FastAPI ASGI-alkalmazás
production kiszolgálására a projekt Uvicornt használ.
