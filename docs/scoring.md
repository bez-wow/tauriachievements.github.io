# Scoring and ranking rules

Every number the site ranks by follows a rule the owner chose. Some deliberately reproduce
another site's numbers, and players compare them. **Changing any rule here is an architectural
decision: ask first.** When a rule does change, update its code, its tests and the page that
explains it together.

## Achievement ladder

- **Code:** `spa/scripts/player-ranking.js` (`RANKINGS`). It is the one definition. The build
  ranks with it and ships it inside the player snapshot (`k`), so the browser sorts by the same
  rules.
- Each ranking compares numeric fields from highest to lowest: achievement points, then
  honorable kills; or honorable kills, then achievement points; or achievements, played time,
  appearances or item level, then achievement points and honorable kills.
- What's still tied falls back to the achievement-point order, which ends on the player key
  (`realm::name`). That's only correct because every ranking also compares achievement points
  and honorable kills, and the module asserts this when it loads.
- **The `#` column** (`collectRanked` in `spa/src/app/ladder.service.ts`) is a row's place on
  the ladder being shown: the whole server, or inside the realm, faction or class filter when
  one is on. That's the same group the movement arrows measure (`buildCohortRankDeltas`).
  **A search only hides rows. It never renumbers them**, so a character looked up keeps their
  real place, as on the Mythic+ leaderboard. The order has no ties, so no two rows share a place.
- **Tests:** `scripts/player-ranking.test.js`, `ladder.service.spec.ts`.

## Guild Rankings

- **Code:** `spa/scripts/generate-guild-rankings.js`. For each limit N, it counts which guilds
  have the most members among the top N players by achievement points, and among the top N by
  honorable kills.
- The limits must match `GUILD_SOURCE_LIMIT_OPTIONS` in `guild-presence-options.ts`.

## Mythic+

- **Run score** (`api/MythicPlusExporter/MythicPlusScore.cs`), modelled on Raider.IO:
  - timed: `50 + 7.5 × level + 12.5 × (1 − time / timer)`;
  - over time: `50 + 7.5 × (level − 1) − 20 × (time / timer − 1)`;
  - more than 40% over the timer: 0 (exactly 40% still scores);
  - rounded to one decimal.

  So a depleted key sits just below a barely timed key one level lower.
- **Player score** (`rankPlayers` in `mythic-plus.ts`): the sum of the character's best run
  score in each dungeon, Raider.IO's classic model. A spec, role or class filter scores a
  character only on the runs played that way.
- **Ties** (`playerRanks`): two players share a place only with the same score and the same
  total time. Places use competition ranking (1, 1, 1, 4).
- **Colours:**
  - Player scores (`scoreTiers`): Raider.IO-style stops at the score that the top 60%, 25%,
    10%, 1% and 0.1% of players reach, from white through green, blue, purple and orange to
    gold.
  - Run scores (`scoreQuality`): the share of the best score; at least 90% is legendary, 84%
    epic, 76% rare.
- **The scoring page** `/mythic-plus/scoring` explains all this with worked examples.
  `Score_MatchesTheScoringPageExamples` in `api/tests/AchievementLadder.Tests/MythicPlusExportServiceTests.cs`
  pins those examples, so change the page and the test together.
- **Tests:** `MythicPlusExportServiceTests`, `mythic-plus.spec.ts`.

## Raid leaderboard

- **Code:** `scoreCharacters` / `rankScores` in `spa/src/app/raid-logs.ts`.
- On each boss, the character's best counted kill is divided by the best anyone did there. The
  average of those shares, times `MAX_SCORE` (6969), floored, is the score. A boss the
  character hasn't killed counts as 0; a boss nobody has killed is left out of the average.
- **This reproduces tauriprogress's character score exactly.** It matched the owner's
  screenshot rank for rank. Don't "fix" the formula.
- Metric: healers are ranked on HPS, every other spec on DPS (`specMetric`), tanks included.
  HPS is healing plus absorbs.
- A spec filter scores characters only on the kills they played as that spec. The best on each
  boss is still the best anyone did there.
- Filters (class, faction, realm) only hide rows and re-rank the rest. Each score is still
  measured against everyone.
- **Tests:** `raid-logs.spec.ts`.

## Raid spec performance

- **Code:** `scoresBySpec`, `topAverage` and `specPerformance` in `spa/src/app/raid-logs.ts`;
  `sortByPerformance` in `spa/src/app/raid-talents.ts`.
- Every character gets the raid leaderboard score for each spec they played, as if that spec
  were picked on the leaderboard. A spec's performance is the average of its best
  `SPEC_TOP_SCORES` (10) character scores, or of all of them when it has fewer, and 0 when
  nobody played it. Only the best ten count, so attendance doesn't drag a spec down.
- Each difficulty is scored on its own, over every boss of the raid.
- Where it shows:
  - Raid Stats → Performance draws it as bars.
  - Talent Analytics lists each role's specs by it, best first. A tie keeps the game's order,
    the order is the same whichever boss is picked, and a picked class shows its specs in the
    game's order instead.
- **Tests:** `raid-logs.spec.ts`, `raid-talents.spec.ts`.

## Arena titles

- **Code:** `ARENA_TITLES`, `getTitleCutoffs` and `getTitle` in `spa/src/app/arena-games.ts`.
  The page lists characters with 50 or more rated games this season (`MIN_GAMES`). A season
  reward needs 50 wins (`REWARD_MIN_WINS`).
- Each title covers a cumulative "top X%" of the listed players by rating:
  - 2v2: Gladiator 0.6%, Duelist 3%, Rival 10%, Challenger 35%;
  - 3v3: Season Gladiator 0.5%, Gladiator 3%, Duelist 10%, Rival 35%, Challenger 45%.
- **Places round up**, the server's rule: 1.01 places are 2. A title whose rounded places don't
  go beyond the better titles' gets no place of its own.
- **A place is a rating, not a player**: everyone on the same rating shares one place.
- The season start is `RatedArenaGameCounter.SeasonStart` (2026-09-16). Changing it discards
  the saved counts.
- **Tests:** `arena-games.spec.ts`.
