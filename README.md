# Tauri Achievements

This repository contains the complete Tauri Achievements application.

- [`spa/`](spa/) contains the Angular single-page application published at
  <https://tauriachievements.github.io/>.
- [`api/`](api/) contains the .NET batch-processing and data-export tools that prepare data for
  the SPA.

## Frontend

```powershell
cd spa
npm install
npm start
```

See [`spa/README.md`](spa/README.md) for frontend details.

## Backend

```powershell
cd api
dotnet tool restore
dotnet build AchievementLadder.sln
dotnet test AchievementLadder.sln --no-build
```

See [`api/README.md`](api/README.md) for backend details.
