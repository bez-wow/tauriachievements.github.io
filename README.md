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

The frontend currently reads leaderboard data from `src/Players.csv` and the displayed timestamp from `src/lastUpdated.txt`.

That approach keeps the app easy to host as a static site while still allowing the ranking data to be refreshed independently. The repository also includes environment templates and API service scaffolding for future or private Tauri API-based workflows.

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

### Prepare environment files

Generate the local environment files from the committed templates:

```bash
node .\scripts\prepare-envs.js
```

If you plan to use the Tauri API integration, fill in the generated files under `src/environments/` with your own credentials. If you are only working on the CSV-driven frontend, the generated placeholder files are enough to get started.

### Start the development server

```bash
npm start
```

The app will usually be available at `http://localhost:4200/`.

### Build for production

```bash
npm run build
```

### Run tests

```bash
npm test
```

## Environment configuration

Template files live in [`src/environments/`](./src/environments/).

- `environment.template.ts`
- `environment.prod.template.ts`
- `environment.dev-proxy.template.ts`

If you need proxy-based local API development, a proxy configuration is already included in [`proxy.conf.json`](./proxy.conf.json).

For more setup details, see [`src/environments/README.md`](./src/environments/README.md).

## Project structure

- `src/app/` - application components, services, models, and ladder logic
- `src/assets/` - images plus race and class icons
- `src/Players.csv` - leaderboard dataset consumed by the frontend
- `src/lastUpdated.txt` - timestamp shown in the UI
- `scripts/prepare-envs.js` - creates missing environment files from templates

## Feedback and contributions

Suggestions, bug reports, and constructive feedback are always welcome.

If you would like to contribute to the project or collaborate on future improvements, feel free to open an issue or reach out on Discord: `xyhop4823`

## License

MIT
