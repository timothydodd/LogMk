using System.Data;
using ServiceStack.OrmLite.Dapper;

namespace LogMkApi.Common;

public class DateTimeHandler : SqlMapper.TypeHandler<DateTime>
{
    public override void SetValue(IDbDataParameter parameter, DateTime value)
    {
        parameter.Value = value;
    }

    public override DateTime Parse(object value)
    {
        return DateTime.SpecifyKind((DateTime)value, DateTimeKind.Utc);
    }
}

//public class DateTimeOffsetHandler : SqlMapper.TypeHandler<DateTimeOffset>
//{
//    public override void SetValue(IDbDataParameter parameter, DateTimeOffset value)
//    {
//        parameter.Value = value;
//    }

//    public override DateTimeOffset Parse(object value)
//    {
//        return DateTimeOffset.SpecifyKind((DateTimeOffset)value, DateTimeKind.Utc);
//    }
//}

