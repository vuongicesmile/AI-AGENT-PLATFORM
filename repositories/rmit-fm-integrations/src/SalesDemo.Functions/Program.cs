using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SalesDemo.Functions;

var builder = FunctionsApplication.CreateBuilder(args);
builder.ConfigureFunctionsWebApplication();
builder.Services.AddSingleton<SalesCsvParser>();
builder.Services.AddSingleton<IWatchdogSender, ServiceBusWatchdogSender>();
builder.Build().Run();
