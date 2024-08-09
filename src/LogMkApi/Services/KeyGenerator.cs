using System.Security.Cryptography;

namespace LogMkApi.Services;

public static class KeyGenerator
{
    public static string GenerateRandomKey(int size = 32) // Default to 256 bits (32 bytes)
    {
        var key = new byte[size];
        using (var rng = RandomNumberGenerator.Create())
        {
            rng.GetBytes(key);
        }
        return Convert.ToBase64String(key);
    }
}
