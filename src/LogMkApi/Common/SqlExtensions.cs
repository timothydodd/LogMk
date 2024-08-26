using System.Text;
using ServiceStack.OrmLite.Dapper;

namespace LogMkApi.Common;

public static class SqlExtensions
{
    public static void AddIfNotNull(this DynamicParameters dynamicParameters,
                                    string name,
                                    object? value)
    {
        if (value != null)
        {
            dynamicParameters.Add($"@{name}", value);
        }
    }
    /// <summary>
    /// Adds a list of parameters to the dyanmicParameter. 
    /// Used in situations where you need  many parameters within a SQL 'where in' clause.
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="dynamicParameters"></param>
    /// <param name="items"></param>
    /// <param name="name"></param>
    /// <returns></returns>
    public static List<string> AddList<T>(this DynamicParameters dynamicParameters, IEnumerable<T> items, string name)
    {
        var unItems = items.Distinct().ToList();

        var Keys = new List<string>();
        for (var index = 0; index < unItems.Count; index++)
        {
            T guid = unItems[index];
            var key = $"{name}{index}";

            Keys.Add($"@{key}");
            dynamicParameters.Add(key, guid);
        }
        return Keys;
    }

    public static List<string> GetSqlFilters<T>(this object obj)
    {
        return new List<string>();
    }


    public static List<string> GetSqlFilters(this object obj,
                                             DynamicParameters dynamicParameters,
                                             List<SqlFieldDescripter> aliases)
    {
        var items = new List<string>();
        Type t = obj.GetType();


        foreach (SqlFieldDescripter tableAliase in aliases)
        {
            System.Reflection.PropertyInfo prop = t.GetProperty(tableAliase.PropertyName);
            if (prop == null)
            {
                throw new Exception($"Invalid  Alias configurations:{tableAliase.PropertyName}");
            }

            var propValue = prop.GetValue(obj);
            if (propValue == null)
            {
                continue;
            }

            var columnName = tableAliase.ColumnName;


            var sp = propValue.ToString().Split(':');
            var cond = "eq";

            if (sp.Length > 1 && !sp[0].IsNullEmptyOrWhiteSpace() && !sp[1].IsNullEmptyOrWhiteSpace())
            {
                propValue = sp[1];
                cond = sp[0];
            }

            dynamicParameters.Add("@" + tableAliase.PropertyName, propValue);


            switch (cond)
            {
                case "like":
                    {
                        items.Add($" AND {columnName} like @{tableAliase.PropertyName} + '%'");
                    }
                    break;
                case "gt":
                    {
                        items.Add($" AND {columnName} > @{tableAliase.PropertyName}");
                    }
                    break;
                case "lt":
                    {
                        items.Add($" AND {columnName} < @{tableAliase.PropertyName}");
                    }
                    break;
                case "gte":
                    {
                        items.Add($" AND {columnName} >= @{tableAliase.PropertyName}");
                    }
                    break;
                case "lte":
                    {
                        items.Add($" AND {columnName} <= @{tableAliase.PropertyName}");
                    }
                    break;
                case "eq":
                    {
                        items.Add($" AND {columnName} = @{tableAliase.PropertyName}");
                    }
                    break;
            }
        }

        return items;
    }

    public static string? GetSqlOrderBy(this object obj, List<TableAlias> names, string propertyName = "OrderBy")
    {
        if (names == null)
        {
            throw new Exception("Order by not properly configured. Missing Table Alias configuration");
        }

        var builder = new StringBuilder();

        Type t = obj.GetType();
        System.Reflection.PropertyInfo prop = t.GetProperty(propertyName);
        if (prop == null)
        {
            throw new Exception("Type: " + t.Name + " does not contain property " + propertyName);
        }

        var value = prop.GetValue(obj);
        if (value == null)
        {
            return null;
        }

        var propValue = value.ToString();
        var orders = propValue.Split(',');
        for (var index = 0; index < orders.Length; index++)
        {
            var orderItem = orders[index];
            var orderCommand = orderItem.Split(':');
            var cond = "asc";

            if (orderCommand.Length > 1 &&
                !orderCommand[0].IsNullEmptyOrWhiteSpace() &&
                !orderCommand[1].IsNullEmptyOrWhiteSpace())
            {
                orderItem = orderCommand[1];
                cond = orderCommand[0];
            }

            TableAlias kvp = names.FirstOrDefault(c =>
                                               c.Name.Equals(orderItem,
                                                             StringComparison.CurrentCultureIgnoreCase));
            if (kvp == null)
            {
                throw new Exception(
                                    $"Invalid order by name :{orderItem} , possibles :{string.Concat(names.Select(c => c.Name + ",")).TrimEnd(',')}");
            }

            if (kvp == null || kvp.Alias.IsNullEmptyOrWhiteSpace())
            {
                continue;
            }

            switch (cond.ToLower())
            {
                case "asc":
                    builder.Append($"{kvp.Alias} asc,");
                    break;
                case "desc":
                    builder.Append($"{kvp.Alias} desc,");
                    break;
            }
        }


        return builder.ToString().TrimEnd(',');
    }

    public static DynamicParameters GetSqlParams(this object obj)
    {
        var dynamicParameters = new DynamicParameters();
        var items = new List<string>();
        Type t = obj.GetType();
        IEnumerable<System.Reflection.PropertyInfo> props = t.GetProperties()
                     .Where(
                            prop => Attribute.IsDefined(prop, typeof(SqlParamAttribute)));

        foreach (System.Reflection.PropertyInfo propertyInfo in props)
        {
            var propValue = propertyInfo.GetValue(obj);
            if (propValue == null)
            {
                continue;
            }

            var columnName = propertyInfo.Name;

            dynamicParameters.Add($"@{columnName}", propValue);
        }

        return dynamicParameters;
    }

    public static bool IsNullEmptyOrWhiteSpace(this string value)
    {
        return string.IsNullOrWhiteSpace(value);
    }
}
public class SqlParamAttribute : Attribute
{

}
public class TableAlias
{
    public string Name { get; set; }
    public string Alias { get; set; }

    public TableAlias(string name, string alias)
    {
        Name = name;
        Alias = alias;
    }
}
public class SqlFieldDescripter
{
    public string PropertyName { get; set; }
    public string ColumnName { get; set; }

    public SqlFieldDescripter(string propertyName, string columnName)
    {
        PropertyName = propertyName;
        ColumnName = columnName;
    }
}
