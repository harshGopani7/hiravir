using Microsoft.Extensions.Logging;
using CommunityToolkit.Maui;
using Hiravir.Core.Accounting;
using Hiravir.Core.Data;
using Hiravir.Core.Interop;

namespace Hiravir;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();

        builder
            .UseMauiApp<App>()
            .UseMauiCommunityToolkit()
            .ConfigureFonts(fonts =>
            {
                fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
            });

        builder.Services.AddMauiBlazorWebView();

#if DEBUG
        builder.Services.AddBlazorWebViewDeveloperTools();
        builder.Logging.AddDebug();
#endif

        // Register core accounting services (singleton — shared in-process memory)
        builder.Services.AddSingleton<DatabaseService>();
        builder.Services.AddSingleton<LedgerTreeService>();
        builder.Services.AddSingleton<StockTreeService>();
        builder.Services.AddSingleton<VoucherService>();
        builder.Services.AddSingleton<CompanyService>();
        builder.Services.AddSingleton<ExportService>();
        builder.Services.AddSingleton<InteropBridge>();

        return builder.Build();
    }
}
