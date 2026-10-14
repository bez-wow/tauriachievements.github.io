namespace MythicPlusExporter;

/// <summary>
/// The run score the page ranks by, raider.io style: the key level carries almost all of it,
/// and the time only orders runs of the same level.
/// <list type="bullet">
/// <item>Timed: 50 + 7.5 per level, plus up to 12.5 for how far under the timer it finished.</item>
/// <item>Over time: scored as one level lower, minus 20 per timer length it ran over.</item>
/// <item>More than 40% over the timer: 0.</item>
/// </list>
/// A depleted +16 therefore lands next to a barely-timed +15. Within one dungeon this keeps
/// the API's own order for timed runs (level first, then clear time).
/// </summary>
public static class MythicPlusScore
{
    private const double BaseScore = 50;
    private const double PerLevel = 7.5;
    private const double TimedBonus = 12.5;
    private const double OverTimePenalty = 20;

    /// <summary>The longest clear that still scores, in thousandths of the timer (140%).</summary>
    private const long MaxScoredTimerPermille = 1400;

    public static double Calculate(int keyLevel, long clearTimeMilliseconds, int timerSeconds)
    {
        if (
            keyLevel <= 0
            || clearTimeMilliseconds <= 0
            || timerSeconds <= 0
            || IsTooSlowToScore(clearTimeMilliseconds, timerSeconds)
        )
        {
            return 0;
        }

        var timerRatio = clearTimeMilliseconds / (timerSeconds * 1000d);
        var score = IsTimed(clearTimeMilliseconds, timerSeconds)
            ? BaseScore + PerLevel * keyLevel + TimedBonus * (1 - timerRatio)
            : BaseScore + PerLevel * (keyLevel - 1) - OverTimePenalty * (timerRatio - 1);

        return Math.Round(score, 1, MidpointRounding.AwayFromZero);
    }

    public static bool IsTimed(long clearTimeMilliseconds, int timerSeconds) =>
        clearTimeMilliseconds <= timerSeconds * 1000L;

    /// <summary>
    /// True when the run went more than 40% over the timer. Exactly 40% over still scores, the
    /// same way a clear exactly on the timer still counts as timed.
    /// </summary>
    public static bool IsTooSlowToScore(long clearTimeMilliseconds, int timerSeconds) =>
        clearTimeMilliseconds > timerSeconds * MaxScoredTimerPermille;
}
