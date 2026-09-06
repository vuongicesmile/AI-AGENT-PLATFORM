using Azure.Identity;
using Azure.Messaging.ServiceBus;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace SalesDemo.Functions;

public sealed record WatchdogTick(string Kind, string TickId, DateTimeOffset SentAtUtc);
public interface IWatchdogSender { Task SendAsync(WatchdogTick tick, CancellationToken cancellationToken); }

public sealed class ServiceBusWatchdogSender(IConfiguration configuration) : IWatchdogSender, IAsyncDisposable
{
    private ServiceBusClient? client;
    private ServiceBusSender? sender;
    public async Task SendAsync(WatchdogTick tick, CancellationToken cancellationToken) {
        // Lazy: parser HTTP vẫn chạy local khi bài Service Bus chưa được cấu hình.
        var host = configuration["ServiceBusNamespace"];
        var queue = configuration["WatchdogQueue"];
        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(queue))
            throw new InvalidOperationException("Cần ServiceBusNamespace và WatchdogQueue.");
        client ??= new ServiceBusClient(host, new DefaultAzureCredential());
        sender ??= client.CreateSender(queue);
        var payload = new { kind = tick.Kind, tickId = tick.TickId, sentAtUtc = tick.SentAtUtc };
        await sender.SendMessageAsync(new ServiceBusMessage(BinaryData.FromObjectAsJson(payload)) {
            MessageId = tick.TickId, ContentType = "application/json"
        }, cancellationToken);
    }
    public async ValueTask DisposeAsync() {
        if (sender != null) await sender.DisposeAsync();
        if (client != null) await client.DisposeAsync();
    }
}

public sealed class WatchdogTimer(IWatchdogSender sender, IConfiguration configuration, ILogger<WatchdogTimer> log)
{
    [Function("WatchdogTimer")]
    public async Task Run([TimerTrigger("%WatchdogSchedule%", RunOnStartup = false)] TimerInfo timer, FunctionContext context) {
        var tick = new WatchdogTick("WatchdogTick", Guid.NewGuid().ToString("N"), DateTimeOffset.UtcNow);
        // LogOnly là chế độ bài thực hành local được ghi rõ, không giả vờ đã gửi queue.
        if (configuration["WatchdogMode"] == "LogOnly") {
            log.LogInformation("LOCAL LogOnly watchdog; Tick={Tick}; no Service Bus message sent", tick.TickId);
            return;
        }
        await sender.SendAsync(tick, context.CancellationToken);
        log.LogInformation("Sent watchdog tick {Tick}; PastDue={PastDue}", tick.TickId, timer.IsPastDue);
    }
}
