# Tauri Achievement Ladder (Frontend)

An Angular single-page UI that renders a World of Warcraft–style leaderboard. Players can be ranked by achievement points or honorable kills, with faction-aware row styling and simple race/class iconography.

The backend application for this project can be found here: [Tauri Achievement Ladder - Backend](https://github.com/HunorTotBagi/tauri-achievement-ladder-backend)

![ezgif-2888cf5aa00f29f8](https://github.com/user-attachments/assets/dd93d758-f477-40c5-b8d0-ded78b49dd57)

## Background & Motivation

The website [Tauri Ladder](https://ladder.tauriwow.com/) previously provided player rankings for the [Tauri World of Warcraft](https://tauriwow.com/) private server, displaying statistics such as achievement points and honorable kills. It allowed players to track their progression and compare their standing across the realm.

After the release of the Legion expansion the website stopped updating, leaving rankings outdated despite the introduction of many new achievements. As a result, players no longer had a reliable way to check their current position.

This project aims to recreate and modernize the original ladder system, restoring accurate and up-to-date rankings for the Tauri WoW community.

## Features
- Advanced filtering and sorting via dropdown menus, allowing users to sort by achievement points or honorable kills, and filter results by realm (Evermoon, Tauri, WoD) and faction (Horde or Alliance).
- Clickable character and guild links that redirect directly to the official armory pages.
- Faction-themed row styling with dedicated placeholders for race and class icons.
- Responsive, single-component layout built with CoreUI for a clean and consistent user experience.
- Standalone Angular architecture (no NgModule), ready for deployment in Tauri desktop applications or standard web hosting environments.

## Tech Stack
- Angular 21 (standalone components)
- CoreUI 5 for styling primitives
- RxJS + HttpClient for data fetching
- SCSS for theming
