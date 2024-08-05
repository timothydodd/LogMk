using LogMkApi.Data;
using Microsoft.AspNetCore.SignalR;

namespace LogMkApi.Hubs;

public class LogHub : Hub
{
    private readonly LogHubService _logHubService;

    public LogHub(LogHubService logHubService)
    {
        _logHubService = logHubService;
    }
    public override Task OnConnectedAsync()
    {
        var userId = Context.ConnectionId;
        _logHubService.SetUserPreferences(Context, new List<string>());
        return base.OnConnectedAsync();
    }

}
public class LogHubService
{
    public readonly Dictionary<string, List<string>> UserPreferences = new();
    private readonly IHubContext<LogHub> _hubContext;

    public LogHubService(IHubContext<LogHub> hubContext)
    {
        _hubContext = hubContext;
    }
    public async Task SendLogs(IEnumerable<Log> lines)
    {
        await _hubContext.Clients.All.SendAsync("ReceiveLog", lines.ToList());

    }
    public Task SetUserPreferences(HubCallerContext context, List<string> preferences)
    {
        var userId = context.ConnectionId;
        UserPreferences[userId] = preferences;
        return Task.CompletedTask;
    }

    public async Task BroadcastEvent(string category, string message)
    {
        foreach (var user in UserPreferences.Where(u => u.Value.Contains(category)))
        {
            await _hubContext.Clients.Client(user.Key).SendAsync("ReceiveEvent", message);
        }
    }
}
