using RoboDodd.OrmLite;
using System.ComponentModel.DataAnnotations;

namespace LogMkApi.Data.Models;

public class User
{
    [PrimaryKey]
    public Guid Id { get; set; } = Guid.NewGuid();
    [Index]
    public required string UserName { get; set; }
    [StringLength(255)]
    public required string PasswordHash { get; set; }

    public required DateTime TimeStamp { get; set; }
}
