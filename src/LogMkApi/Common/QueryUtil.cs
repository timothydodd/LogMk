using System.Text;

namespace LogMkApi.Common;

public class WhereBuilder
{
    private readonly StringBuilder _builder = new();

    public void AppendAnd(object? checkItem, string query)
    {
        if (checkItem == null)
        {
            return;
        }

        AppendAnd(query);
    }

    public void AppendAnd(string query)
    {
        if (_builder.Length == 0)
        {
            _builder.Append(" WHERE ");
            _builder.Append(query);
        }
        else
        {
            _builder.Append(" AND ");
            _builder.Append(query);
        }
    }

    public override string ToString()
    {
        return _builder.ToString();
    }
}

public class AndOrBuilder
{
    private readonly StringBuilder _builder = new();

    public int Length
    {
        get { return _builder.Length; }
    }

    public void AppendOr(object? checkItem, string query)
    {
        if (checkItem == null)
        {
            return;
        }

        AppendOr(query);
    }

    public void AppendOr(string query)
    {
        if (_builder.Length == 0)
        {
            _builder.Append(query);
        }
        else
        {
            _builder.Append(" OR ");
            _builder.Append(query);
        }
    }

    public override string ToString()
    {
        return _builder.ToString();
    }
}
