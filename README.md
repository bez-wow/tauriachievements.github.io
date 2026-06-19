# Tauri Achievements

> A modern World of Warcraft-style leaderboard for the Tauri WoW community.

Tauri Achievements is an Angular single-page application that recreates the spirit of the original Tauri Ladder with a cleaner UI, better filtering, and a more maintainable frontend. It lets players browse rankings by achievement points or honorable kills, compare characters across realms, and quickly jump to relevant armory pages.

<img width="1168" height="679" alt="image" src="https://github.com/user-attachments/assets/07c98e5d-e364-4888-afec-300ece092b80" />

## Why this project exists

The original Tauri Ladder used to be the go-to place for checking character rankings on the Tauri private server. It gave players a simple way to follow their progress and compare themselves with others across the realm.

After the Legion expansion, that site stopped updating. New achievements arrived, rankings became stale, and the community lost a reliable way to see who was actually leading.

This project is an effort to bring that experience back in a modern form and make the ladder useful again for current players.

## Features

- World of Warcraft-inspired leaderboard presentation
- Ranking by achievement points or honorable kills
- Realm, faction, and class filtering
- Character name and guild search with highlighted matches
- Faction-aware row styling
- Race and class icons for faster scanning
- Shareable filter state via URL query parameters
- Last-updated timestamp displayed in the UI
- Links to Tauri armory character and guild pages
- Local caching for faster repeat visits

## How it works

`src/Players.csv` remains the source dataset in the repository, but the app itself reads a build-generated JSON snapshot derived from it. The displayed timestamp still comes from `src/lastUpdated.txt`.

That keeps the site easy to host statically while avoiding CSV parsing work in the browser on every load.

## Tech stack

- Angular 21
- TypeScript
- SCSS
- RxJS

## Getting started

### Prerequisites

- Node.js `^20.19.0 || ^22.12.0 || ^24.0.0`
- npm `>= 10`

### Install dependencies

```bash
npm install
```

### Start the development server

The snapshot is generated automatically before the dev server starts.

```bash
npm start
```

The app will usually be available at `http://localhost:4200/`.

### Build for production

The production build also regenerates the snapshot automatically.

```bash
npm run build
```

## Project structure

- `src/app/` - application components, services, models, and ladder logic
- `src/assets/` - images plus race and class icons
- `src/Players.csv` - leaderboard dataset consumed by the frontend
- `src/lastUpdated.txt` - timestamp shown in the UI

## Feedback and contributions

Suggestions, bug reports, and constructive feedback are always welcome.

If you would like to contribute to the project or collaborate on future improvements, feel free to open an issue or reach out on Discord: `xyhop4823`

## License

MIT
