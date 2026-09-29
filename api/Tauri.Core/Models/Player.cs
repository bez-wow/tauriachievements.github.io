namespace Tauri.Core.Models
{
    public class Player
    {
        public string Name { get; set; } = string.Empty;
        public int Race { get; set; }
        public int Gender { get; set; }
        public int Class { get; set; }
        public string Realm { get; set; } = string.Empty;
        public string Guild { get; set; } = string.Empty;
        public int AchievementPoints { get; set; }
        public int HonorableKills { get; set; }
        public string Faction { get; set; } = string.Empty;
        public int AppearanceCount { get; set; }

        /// <summary>
        /// UTC date the character earned the "Level 10" achievement, which marks when it was
        /// started. The frontend derives the character's age from it at display time.
        /// </summary>
        public DateOnly? Level10Date { get; set; }
        public int Level { get; set; }
        public decimal? ItemLevel { get; set; }
        public long PlayedTime { get; set; }
        public int AchievementsTotal { get; set; }
    }
}
