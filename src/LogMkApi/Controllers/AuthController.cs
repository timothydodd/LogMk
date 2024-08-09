using System.Security.Claims;
using LogMkApi.Data.Models;
using LogMkApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ServiceStack.Data;
using ServiceStack.OrmLite.Dapper;

namespace LogMkApi.Controllers;
[Authorize]
[ApiController]
[Route("api/auth")]
public class AuthController : Controller
{
    private readonly IDbConnectionFactory _dbFactory;
    private readonly AuthService _authService;

    public AuthController(IDbConnectionFactory dbFactory, AuthService authService)
    {
        _dbFactory = dbFactory;
        _authService = authService;
    }
    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        using (var db = _dbFactory.OpenDbConnection())
        {
            // In a real-world scenario, you would retrieve the user from a database
            var user = (await db.QueryAsync<User>("SELECT * FROM User WHERE UserName = @UserName", new { UserName = request.UserName })).FirstOrDefault();
            if (user == null || !_authService.ValidateUser(user, request.Password))
            {
                return Unauthorized("Invalid email or password.");
            }

            var token = _authService.GenerateJwtToken(user);
            return Ok(new { Token = token });
        }
    }
    [Authorize]
    [HttpGet("user")]
    public async Task<IActionResult> GetUser()
    {
        var userName = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value;
        if (userName == null)
        {
            return Unauthorized();
        }
        using (var db = _dbFactory.OpenDbConnection())
        {
            var user = (await db.QueryAsync<User>("SELECT * FROM User WHERE UserName = @UserName", new { UserName = userName })).FirstOrDefault();
            if (user == null)
            {
                return NotFound();
            }


            return Ok(new UserResponse() { Id = user.Id, UserName = user.UserName });
        }
    }

}
public class LoginRequest
{
    public required string UserName { get; set; }
    public required string Password { get; set; }
}
public class UserResponse
{
    public Guid Id { get; set; }
    public required string UserName { get; set; }
}
