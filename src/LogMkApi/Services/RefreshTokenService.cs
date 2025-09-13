using System.Security.Cryptography;
using LogMkApi.Data.Models;
using RoboDodd.OrmLite;

namespace LogMkApi.Services;

public class RefreshTokenService
{
    private readonly DbConnectionFactory _dbFactory;
    private readonly IConfiguration _configuration;

    public RefreshTokenService(DbConnectionFactory dbFactory, IConfiguration configuration)
    {
        _dbFactory = dbFactory;
        _configuration = configuration;
    }

    public async Task<RefreshToken> CreateRefreshTokenAsync(Guid userId)
    {
        var token = GenerateRefreshToken();
        var expiryDays = _configuration.GetValue<int>("JwtSettings:RefreshTokenExpiryDays", 30);

        var refreshToken = new RefreshToken
        {
            Token = token,
            UserId = userId,
            ExpiryDate = DateTime.UtcNow.AddDays(expiryDays),
            IsRevoked = false,
            CreatedDate = DateTime.UtcNow
        };

        using var db = _dbFactory.CreateConnection();
        refreshToken.Id = (int)await db.InsertAsync(refreshToken, selectIdentity: true);

        return refreshToken;
    }

    public async Task<RefreshToken?> GetRefreshTokenAsync(string token)
    {
        using var db = _dbFactory.CreateConnection();
        return (await db.SelectAsync<RefreshToken>(x => x.Token == token && !x.IsRevoked)).FirstOrDefault();
    }

    public async Task<bool> ValidateRefreshTokenAsync(string token)
    {
        var refreshToken = await GetRefreshTokenAsync(token);
        return refreshToken != null && refreshToken.ExpiryDate > DateTime.UtcNow;
    }

    public async Task RevokeRefreshTokenAsync(string token)
    {
        using var db = _dbFactory.CreateConnection();
        var refreshToken = (await db.SelectAsync<RefreshToken>(x => x.Token == token)).FirstOrDefault();
        if (refreshToken != null)
        {
            refreshToken.IsRevoked = true;
            await db.UpdateAsync(refreshToken);
        }
    }

    public async Task RevokeAllUserRefreshTokensAsync(Guid userId)
    {
        using var db = _dbFactory.CreateConnection();
        var tokens = await db.SelectAsync<RefreshToken>(x => x.UserId == userId && !x.IsRevoked);
        foreach (var token in tokens)
        {
            token.IsRevoked = true;
            await db.UpdateAsync(token);
        }
    }

    public async Task<RefreshToken> RotateRefreshTokenAsync(string oldToken, Guid userId)
    {
        // Revoke the old token
        await RevokeRefreshTokenAsync(oldToken);

        // Create a new token
        return await CreateRefreshTokenAsync(userId);
    }

    public async Task CleanupExpiredTokensAsync()
    {
        using var db = _dbFactory.CreateConnection();
        await db.DeleteAsync<RefreshToken>(x => x.ExpiryDate < DateTime.UtcNow);
    }

    private string GenerateRefreshToken()
    {
        var randomNumber = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomNumber);
        return Convert.ToBase64String(randomNumber);
    }
}