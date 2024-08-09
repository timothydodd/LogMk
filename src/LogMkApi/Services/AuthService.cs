using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using LogMkApi.Data.Models;
using Microsoft.IdentityModel.Tokens;

namespace LogMkApi.Services;

public class AuthService
{
    private readonly IConfiguration _configuration;
    private readonly PasswordService _passwordService;

    public AuthService(IConfiguration configuration, PasswordService passwordService)
    {
        _configuration = configuration;
        _passwordService = passwordService;
    }

    public string GenerateJwtToken(User user)
    {
        var jwtSettings = _configuration.GetSection("JwtSettings");
        var secretKey = jwtSettings["Secret"];
        var issuer = jwtSettings["Issuer"];
        var audience = jwtSettings["Audience"];
        var expiryMinutes = Convert.ToInt32(jwtSettings["ExpiryMinutes"]);

        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.UserName),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.Now.AddMinutes(expiryMinutes),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public bool ValidateUser(User user, string password)
    {
        return _passwordService.VerifyPassword(user, password);
    }
}
