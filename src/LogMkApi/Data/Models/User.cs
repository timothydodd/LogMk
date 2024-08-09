using ServiceStack.DataAnnotations;

namespace LogMkApi.Data.Models;

public class User
{
    [PrimaryKey]
    [AutoId]
    public Guid Id { get; set; }
    [Index]
    public required string UserName { get; set; }
    [StringLength(255)]
    public required string PasswordHash { get; set; }
    public required DateTime TimeStamp { get; set; }
}
