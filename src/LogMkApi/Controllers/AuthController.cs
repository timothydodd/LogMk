using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using LogMkApi.Data.Models;
using LogMkApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using ServiceStack.Data;
using ServiceStack.OrmLite;
using ServiceStack.OrmLite.Dapper;

namespace LogMkApi.Controllers;
[Authorize]
[ApiController]
[Route("api/auth")]
public class AuthController : Controller
{
    private readonly IDbConnectionFactory _dbFactory;
    private readonly AuthService _authService;
    private readonly PasswordService _passwordService;
    private readonly RefreshTokenService _refreshTokenService;
    private readonly IConfiguration _configuration;

    public AuthController(IDbConnectionFactory dbFactory, AuthService authService, PasswordService passwordService, RefreshTokenService refreshTokenService, IConfiguration configuration)
    {
        _dbFactory = dbFactory;
        _authService = authService;
        _passwordService = passwordService;
        _refreshTokenService = refreshTokenService;
        _configuration = configuration;
    }
    [AllowAnonymous]
    [EnableRateLimiting("AuthPolicy")]
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }
        
        try
        {
            using (var db = _dbFactory.OpenDbConnection())
            {
                // In a real-world scenario, you would retrieve the user from a database
                var user = (await db.QueryAsync<User>("SELECT * FROM User WHERE UserName = @UserName", new { UserName = request.UserName })).FirstOrDefault();
                if (user == null || !_authService.ValidateUser(user, request.Password))
                {
                    return Unauthorized(new { Error = "Invalid username or password" });
                }

                var token = _authService.GenerateJwtToken(user);
                var refreshToken = await _refreshTokenService.CreateRefreshTokenAsync(user.Id);

                return Ok(new LoginResponse
                {
                    AccessToken = token,
                    RefreshToken = refreshToken.Token,
                    ExpiresIn = _configuration.GetValue<int>("JwtSettings:ExpiryMinutes", 30) * 60
                });
            }
        }
        catch (Exception ex)
        {
            // Log the exception but don't expose internal details
            return StatusCode(500, new { Error = "An error occurred during authentication" });
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
    [Authorize]
    [EnableRateLimiting("AuthPolicy")]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePasswordAsync([FromBody] ChangePasswordRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }
        
        var userName = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value;
        if (userName == null)
        {
            return Unauthorized(new { Error = "User not authenticated" });
        }
        
        try
        {
            using (var db = _dbFactory.OpenDbConnection())
            {
                var user = (await db.QueryAsync<User>("SELECT * FROM User WHERE UserName = @UserName", new { UserName = userName })).FirstOrDefault();
                if (user == null)
                {
                    return NotFound(new { Error = "User not found" });
                }
                if (!_authService.ValidateUser(user, request.OldPassword))
                {
                    return Unauthorized(new { Error = "Current password is incorrect" });
                }
                user.PasswordHash = _passwordService.HashPassword(user, request.NewPassword);
                await db.UpdateAsync(user);
                return Ok(new { Message = "Password changed successfully" });
            }
        }
        catch (Exception ex)
        {
            // Log the exception but don't expose internal details
            return StatusCode(500, new { Error = "An error occurred while changing the password" });
        }
    }

    [AllowAnonymous]
    [HttpPost("refresh")]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenRequest request)
    {
        var principal = _authService.GetPrincipalFromExpiredToken(request.AccessToken);
        if (principal == null)
        {
            return BadRequest(new { Error = "Invalid access token" });
        }

        var userId = _authService.GetUserIdFromPrincipal(principal);
        if (!userId.HasValue)
        {
            return BadRequest(new { Error = "Invalid access token" });
        }

        if (!await _refreshTokenService.ValidateRefreshTokenAsync(request.RefreshToken))
        {
            return Unauthorized(new { Error = "Invalid refresh token" });
        }

        using var db = _dbFactory.OpenDbConnection();
        var user = (await db.SelectAsync<User>(u => u.Id == userId.Value)).FirstOrDefault();
        if (user == null)
        {
            return NotFound(new { Error = "User not found" });
        }

        // Rotate refresh token
        var newRefreshToken = await _refreshTokenService.RotateRefreshTokenAsync(request.RefreshToken, user.Id);
        var newAccessToken = _authService.GenerateJwtToken(user);

        return Ok(new LoginResponse
        {
            AccessToken = newAccessToken,
            RefreshToken = newRefreshToken.Token,
            ExpiresIn = _configuration.GetValue<int>("JwtSettings:ExpiryMinutes", 30) * 60
        });
    }

    [HttpPost("revoke")]
    public async Task<IActionResult> RevokeToken([FromBody] RevokeTokenRequest request)
    {
        await _refreshTokenService.RevokeRefreshTokenAsync(request.RefreshToken);
        return Ok(new { Message = "Token revoked successfully" });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        var userId = _authService.GetUserIdFromPrincipal(User);
        if (userId.HasValue)
        {
            await _refreshTokenService.RevokeAllUserRefreshTokensAsync(userId.Value);
        }
        return Ok(new { Message = "Logged out successfully" });
    }

}
public class ChangePasswordRequest
{
    [Required(ErrorMessage = "Old password is required")]
    [StringLength(256, MinimumLength = 1, ErrorMessage = "Old password must be between 1 and 256 characters")]
    public required string OldPassword { get; set; }
    
    [Required(ErrorMessage = "New password is required")]
    [StringLength(256, MinimumLength = 8, ErrorMessage = "New password must be between 8 and 256 characters")]
    [RegularExpression(@"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]", 
        ErrorMessage = "New password must contain at least one lowercase letter, one uppercase letter, one digit, and one special character")]
    public required string NewPassword { get; set; }
}

public class LoginRequest
{
    [Required(ErrorMessage = "Username is required")]
    [StringLength(100, MinimumLength = 3, ErrorMessage = "Username must be between 3 and 100 characters")]
    [RegularExpression(@"^[a-zA-Z0-9_@.-]+$", ErrorMessage = "Username can only contain letters, numbers, underscores, periods, hyphens, and @ symbols")]
    public required string UserName { get; set; }
    
    [Required(ErrorMessage = "Password is required")]
    [StringLength(256, MinimumLength = 1, ErrorMessage = "Password must be between 1 and 256 characters")]
    public required string Password { get; set; }
}
public class UserResponse
{
    public Guid Id { get; set; }
    public required string UserName { get; set; }
}

public class LoginResponse
{
    public required string AccessToken { get; set; }
    public required string RefreshToken { get; set; }
    public int ExpiresIn { get; set; }
}

public class RefreshTokenRequest
{
    [Required(ErrorMessage = "Access token is required")]
    public required string AccessToken { get; set; }
    
    [Required(ErrorMessage = "Refresh token is required")]
    public required string RefreshToken { get; set; }
}

public class RevokeTokenRequest
{
    [Required(ErrorMessage = "Refresh token is required")]
    public required string RefreshToken { get; set; }
}
