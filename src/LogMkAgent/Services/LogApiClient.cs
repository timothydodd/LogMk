using System.IO.Compression;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using LogMkAgent;

public class LogApiClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<LogApiClient> _logger;

    static readonly JsonSerializerOptions jsonOptions = new JsonSerializerOptions()
    {
        TypeInfoResolver = new ApiJsonSerializerContext()
    };
    public LogApiClient(HttpClient httpClient, ILogger<LogApiClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;

    }

    public async Task<T> GetDataAsync<T>(string url)
    {
        var response = await _httpClient.GetAsync(url);
        response.EnsureSuccessStatusCode();

        if (response.Content.Headers.ContentEncoding.Contains("br"))
        {

            // Handle Brotli-compressed response
            var decompressedData = await DecompressDataAsync(response.Content.ReadAsStream());
            return JsonSerializer.Deserialize<T>(decompressedData, jsonOptions);
        }
        else
        {
            // Handle uncompressed response
            return await response.Content.ReadFromJsonAsync<T>(jsonOptions);
        }
    }

    public async Task<HttpResponseMessage> SendDataAsync<T>(string url, T data, CancellationToken cancellationToken)
    {
        var compressedData = CompressData(data);
        var requestContent = new ByteArrayContent(compressedData);
        requestContent.Headers.Add("Content-Encoding", "br");
        requestContent.Headers.Add("Content-Type", "application/json");

        return await _httpClient.PostAsync(url, requestContent, cancellationToken);
    }


    private byte[] CompressData<T>(T data)
    {
        var jsonData = System.Text.Json.JsonSerializer.Serialize(data, jsonOptions);
        var dataBytes = Encoding.UTF8.GetBytes(jsonData);


        using var outputStream = new MemoryStream();
        using (var compressionStream = new BrotliStream(outputStream, CompressionLevel.Optimal))
        {
            compressionStream.Write(dataBytes, 0, dataBytes.Length);
        }
        var compressedData = outputStream.ToArray();
        //write the compressed data to the output stream
        _logger.LogDebug($"Compressed data from {dataBytes.Length} to {compressedData.Length}");
        return compressedData;
    }
    private async Task<string> DecompressDataAsync(Stream compressedStream)
    {
        using var decompressionStream = new BrotliStream(compressedStream, CompressionMode.Decompress);
        using var streamReader = new StreamReader(decompressionStream);
        return await streamReader.ReadToEndAsync();
    }
}
