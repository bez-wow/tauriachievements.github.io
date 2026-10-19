# How to add a guild page

Guild pages are unlisted statistics pages, one per guild, at `/<key>-<8 hex>` (for example
`/endless-f8c2a91d`). All of them are `Endless6531PageComponent`, reading
`spa/src/guild-analysis/<key>.json`, which `api/Guildkukker` writes.

The owner asks for these by guild name and realm. They're routine and don't need an
architecture discussion.

## Steps

1. **Pick the key.** It's the guild name, lowercased and kebab-cased, with accents dropped
   ("Témérité" → `temerite`). Guildkukker names the JSON file the same way. Check the first run's
   output file name before you rely on it.
2. **`spa/src/app/guild-analysis.ts`:** add the key to the `GuildAnalysisKey` union.
3. **`spa/src/app/app.routes.ts`:** copy one guild route block and change `path` and
   `data.guild`. The path is `<key>-` followed by 8 random hex characters, so the address can't
   be guessed:

   ```ts
   {
     path: '<key>-<8 hex>',
     loadComponent: () => import('./endless6531-page.component')
       .then(module => module.Endless6531PageComponent),
     data: { guild: '<key>' },
     resolve: { analysis: guildAnalysisResolver }
   },
   ```

   Generate the hex with, for example,
   `node -e "console.log(require('crypto').randomBytes(4).toString('hex'))"`.
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
