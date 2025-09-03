using LogMkCommon;
using Microsoft.Extensions.Caching.Memory;

namespace LogMkAgent.Services;

public class SettingsService
{
    private readonly LogApiClient _apiClient;
    private readonly ILogger<SettingsService> _logger;
    private readonly IMemoryCache _cache;
    private readonly TimeSpan _cacheExpiry = TimeSpan.FromMinutes(30);
    private const string SETTINGS_CACHE_KEY = "validation_settings";

    public SettingsService(LogApiClient apiClient, ILogger<SettingsService> logger, IMemoryCache cache)
    {
        _apiClient = apiClient;
        _logger = logger;
        _cache = cache;
    }

    public async Task<ValidationSettings?> GetValidationSettingsAsync(CancellationToken cancellationToken = default)
    {
        // Try to get from cache first
        if (_cache.TryGetValue(SETTINGS_CACHE_KEY, out ValidationSettings? cachedSettings))
        {
            _logger.LogDebug("Using cached validation settings");
            return cachedSettings;
        }

        try
        {
            _logger.LogDebug("Fetching validation settings from API");
            var settings = await _apiClient.GetDataAsync<ValidationSettings>("api/log/settings");
            
            // Cache the settings
            _cache.Set(SETTINGS_CACHE_KEY, settings, _cacheExpiry);
            
            _logger.LogInformation("Fetched validation settings: MaxDaysOld={MaxDaysOld}, MaxBatchSize={MaxBatchSize}, Version={Version}",
                settings.MaxDaysOld, settings.MaxBatchSize, settings.Version);
            
            return settings;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch validation settings from API, using defaults");
            
            // Return default settings if API call fails
            var defaultSettings = new ValidationSettings();
            _cache.Set(SETTINGS_CACHE_KEY, defaultSettings, TimeSpan.FromMinutes(5)); // Shorter cache for fallback
            
            return defaultSettings;
        }
    }

    public void InvalidateCache()
    {
        _cache.Remove(SETTINGS_CACHE_KEY);
        _logger.LogDebug("Validation settings cache invalidated");
    }

    public async Task<LogLineValidator?> GetValidatorAsync(CancellationToken cancellationToken = default)
    {
        var settings = await GetValidationSettingsAsync(cancellationToken);
        return settings != null ? new LogLineValidator(settings) : null;
    }
}