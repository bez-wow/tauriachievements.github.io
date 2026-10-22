# How to add a guild page

Guild pages are unlisted statistics pages, one per guild, at `/<key>-<8 hex>` (for example
`/endless-f8c2a91d`). All of them are `GuildAnalysisPageComponent`, reading
`spa/src/guild-analysis/<key>.json`, which `api/Guildkukker` writes. `GUILD_PAGES` in
`spa/src/app/features/guild-analysis/guild-analysis.ts` lists them, and
`guild-analysis.routes.ts` makes one route per entry.

The owner asks for these by guild name and realm. They're routine and don't need an
architecture discussion.

## Steps

1. **Pick the key.** It's the guild name, lowercased and kebab-cased, with accents dropped
   ("Témérité" → `temerite`). Guildkukker names the JSON file the same way. Check the first run's
   output file name before you rely on it.
2. **`GUILD_PAGES` in `spa/src/app/features/guild-analysis/guild-analysis.ts`:** add one
   line. The page's address is the key, a hyphen and `hash`, 8 random hex characters, so it
   can't be guessed. `name` and `realm` show until the scan's own guild details load:

   ```ts
   { key: '<key>', hash: '<8 hex>', name: '<Guild Name>', realm: '<Realm>' },
   ```

   Generate the hex with, for example,
   `node -e "console.log(require('crypto').randomBytes(4).toString('hex'))"`. Nothing else in
   the app changes: the route comes from the table.
3. **`spa/e2e/visual-pages.ts`:** add the page, so the visual check covers it.
4. **`api/guild-analysis.cmd`:** add `call :ScanGuild "<Realm>" "<Guild Name>"` with its
   `if errorlevel 1 goto :ScanFailed` line, so the daily update keeps the page fresh. The realm
   is `Evermoon`, `Tauri` or `WoD`.
5. **Scan it once by hand** (from `api/`):

   ```powershell
   dotnet run --project Guildkukker -- <Realm> "<Guild Name>" --output-directory ../spa/src/guild-analysis
   ```

   The data manifest picks the new JSON up on the next build, so no `angular.json` change is
   needed.
6. **Check it:** `npm start`, open `/<key>-<hex>`, and check the roster, filters and phone
   layout.

Don't add the page to `nav-sections.ts`. Give the owner the URL; they share it with the
guild.
