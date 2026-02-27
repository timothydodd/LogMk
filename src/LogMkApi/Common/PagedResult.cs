namespace LogMkApi.Common;

public class PagedResults<T>
{
    public IEnumerable<T>? Items { get; set; }
    public int TotalCount { get; set; }
}

public class CursorPagedResults<T>
{
    public IEnumerable<T>? Items { get; set; }
    public bool HasMore { get; set; }
    public DateTime? NextCursorTimestamp { get; set; }
    public long? NextCursorId { get; set; }
}



public class LogStatistic
{
    public required Dictionary<DateTime, Dictionary<string, int>> Counts { get; set; }
    public TimePeriod TimePeriod { get; set; }
}

public enum TimePeriod
{
    Hour,
    Day
}
