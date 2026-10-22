# Tauri API

Every job in `api/` reads the Tauri armory API. It is undocumented and inconsistent, so this
page collects what the code relies on. Each fact names its source: **code** means the
exporters encode it (see the file named); **observed** means it was seen in real responses
on that date and could change. When a fact matters to a change, check it against a live
response first.

## Requests

- One endpoint: a POST to `BaseUrl?apikey=<key>` with a JSON body
  `{ "secret": "…", "url": "<method>", "params": { … } }`. Code: `TauriApiClient`.
- Only ever call it through `ITauriApiClient`. It handles bounded concurrency, timeouts,
  retries with backoff, and reading the API's error codes. Settings come from
  `AchievementLadder/appsettings.json` or the `TAURI_API_*` environment variables.
- **Realms:** `[EN] Evermoon` (short name Evermoon), `[HU] Tauri WoW Server` (Tauri),
  `[HU] Warriors of Darkness` (WoD). Code: `CharacterHelpers` in `Tauri.Core`. The numeric
  realm ids in raid responses (`rid`, `guildrid`) are 9 = Evermoon, 11 = WoD and 12 = Tauri.
  Code: `RaidCatalog`.
- Methods in use: `character-sheet`, `character-achievements`, `character-itemappearances`,
  `character-artifact`, `character-reputation`, `character-minimal-data`, `guild-info`,
  `achievement-firsts`, `challenge-index`, `challenge-leaderboard`, `raid-rank-encounter`,
  `raid-log`, `pvp-match`.

## Errors

- An error is HTTP 400 with a body like
  `{"success":false,"errorcode":13,"errorstring":"guild not found"}`.
  `TauriApiResponseResult.ApiErrorCode` exposes the code. Code: `TauriApiClient`.
- `13` (`GuildNotFoundErrorCode`): the guild doesn't exist on that realm.
  GuildCharacterExporter removes such guilds, at most 5% of the guilds per run.
- `6` (`CharacterNotFoundErrorCode`): the character doesn't exist on that realm (renamed,
  transferred or deleted).
- Treat a failed lookup as "unknown", never as an answer. For example, a failed or incomplete
  `character-sheet` never makes a character guildless.

## Characters and guilds

- `character-sheet`: a guildless character has `guildName: ""`. Code:
  `RaidLogGuildAndCharScanService`.
- `character-artifact` returns every artifact the character owns (main-hand piece only, one per
  spec). Code: `Guildkukker/GuildMemberExportService`.
  - **Traits** = the sum of `purchasedrank` over `artifacts[].artifact.artifactpowers`, for the
    artifact with the highest sum. The free first trait (`isfirstbonus`) and relic ranks don't
    count.
  - `artifact_knowledge` is the Artifact Knowledge level.
  - Observed 2026-10-14: `artifacts[].artifact.xp` is that weapon's unspent artifact power, not
    a lifetime total.
- Observed 2026-10-17: deleted or transferred characters come back from
  `character-minimal-data` with no name and class 0.

## Mythic+ (`challenge-index`, `challenge-leaderboard`)

- Evermoon's leaderboard also holds every Tauri run, so asking Tauri only returns it a second
  time. WoD has its own. The exporter asks Evermoon and WoD. Code:
  `MythicPlusExporterOptions`.
- Empty affix slots come back as id `0`. Affix slots unlock at +4, +7 and +10, in that order.
  Characters the API no longer knows come back with `playerinfo: {}`. Both are dropped. Code:
  `ChallengeResponseParser`.
- Some dungeons are listed but not open yet. `MythicPlusCatalog.UnreleasedChallengeIds` skips
  them (227, 233, 234, 239). Remove an id when that dungeon opens.
- The season's name and start date are constants in `MythicPlusCatalog`. Edit them for a new
  season, and run the exporter with `--allow-shrink`.
- Observed 2026-10-05: `medal` matches the timer cutoffs exactly (a bronze time equals the
  timer).

## Raid logs (`raid-rank-encounter`, `raid-log`)

- Only The Emerald Nightmare is tracked (map 1520). Difficulties: 14 Normal, 15 Heroic,
  16 Mythic, 17 LFR. Code: `RaidCatalog`.
- Legion raids of Evermoon and Tauri characters are all logged under `[HU] Tauri WoW Server`.
  WoD logs its own. Log ids are per realm. Code: `RaidLogExporterOptions` (checked
  2026-10-12).
- Observed 2026-10-12: LFR has no logs on any realm. LFR-only raiders therefore never appear.
- The API's `encounter_order` is not the Encounter Journal order (it puts Ursoc second).
  `RaidCatalog.Bosses` holds the real order. Code: `RaidCatalog`.
- **Guild names are wrong for Evermoon guilds.** On a Tauri log, an Evermoon guild
  (`guildrid` 9) comes back with the name and faction of the *Tauri* guild that has the same
  id, or with no name at all. `RaidGuildResolver` takes the most common Players.csv guild among
  that guild's raiders, and accepts it only when `guild-info` on Evermoon returns the same
  guild id. Confirmed names are cached in the boss files. Code: `RaidGuildResolver`.
- **Genders are wrong.** The raid API reports almost everyone as male. The build corrects the
  leaderboard's race icons from Players.csv (`scripts/generate-raid-genders.js` writes
  `raid-genders.json`).
- A few logs pair a class with another class's spec. Those members get spec 0 and are left out
  of the spec rankings. Code: `RaidCatalog.ValidSpecId`.
- Talents come as one string per member, for example `"Za!1212212"`: class and spec letters,
  then one 0-based column per tier, with `.` for none. The talent trees, their tooltips and
  the item names come from TauriShoot (below).

## TauriShoot (`legion-shoot.tauri.hu`)

The Legion database site. RaidLogExporter reads three of its endpoints, with no key:

- `?talent-frag&c=<classId>`: a class's talent tiers, each talent's spell id, name and icon.
  Numbers come as strings. If any class can't be read, the last `talents.json` and
  `talent-tooltips.json` stay. Code: `TauriShootTalentSource`.
- `?item=<id>&xml`: an item's name, quality and icon. Code: `TauriShootItemSource`.
- `ajax/ajax.php?spell=<id>&power2`: a spell's tooltip, the request TauriShoot's own
  `power.js` embed makes. It answers JavaScript,
  `$TauriPower.registerSpell(<id>, 0,{icon: '…',tooltip_enus: '…'}, "legion");`, with the
  tooltip as HTML in a single-quoted string. A spell it doesn't know comes back as `{}`. About
  1 kB and 0.2 s per spell. Code: `TauriShootSpellTooltipSource`.
- `?spell=<id>` is the page for people: about 15 kB of HTML, and no CORS headers, so the site
  can't read it from the browser.

Tooltip quirks, observed 2026-10-22 over the 603 talent spells. The exporter cleans them up as
[data-pipeline.md](data-pipeline.md#talent-tooltips) describes.

- Amounts that scale with attack or spell power come out as `0` ("dealing 0 Nature damage")
  or as a stand-in number ("dealing 1 Frost damage", once even a spell id).
- Some formulas stay unresolved: `${15 sec-1.5}`, `$192082s%`, "every 0 sec1 sec", "by %".
- Reductions carry a minus: "cost -10% less Rage", "by -25%".
- Rage, Runic Power and Pain costs read ten times too high (Focused Rage: "200 Rage"). Not
  checked in game.
- A spell with charges shows its short per-use cooldown (Shimmer 0.5 sec, Rune Tap 1.5 sec), not
  its recharge. Disengage, Ranger's Net and Hungering Rune Weapon show "1 sec cooldown".
- A self-cast spell shows "Unlimited range", and a passive talent "Instant".

## PvP matches (`pvp-match`)

Code: `BattlegroundCollector`, `RatedArenaGameCounter`.

- Match ids are shared by all three realms: the same id returns the same match whatever `r`
  is.
- `bgtype`: 0 = battleground, 2 = rated 2v2, 3 = rated 3v3 **and** every skirmish. Only
  `isranked` matches count.
- **`winner` holds the losing side.** A player won when `side != winner`. `winner == 2` means
  no winner was recorded; such a game counts as a win only for players whose rating went up.
- Observed 2026-10-17: `personal_rating` is the rating going into the game, so the current
  rating is the latest game's rating plus its `personal_rating_change`. Ids are assigned when
  a match ends, so `starttime` isn't in id order.
- Observed 2026-10-17: the armory's `character-sheet` arena data (`characterArenaTeamInfo`)
  is all zeros. Match data is the only rating source.
