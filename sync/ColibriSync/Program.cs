using System.Diagnostics;
using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

var app = new ColibriSyncApp();
await app.RunAsync(args);

public sealed class ColibriSyncApp
{
    private readonly SyncConfig _config = SyncConfig.Default();
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public async Task RunAsync(string[] args)
    {
        bool debug = args.Any(a => a.Equals("--debug", StringComparison.OrdinalIgnoreCase));
        Console.OutputEncoding = Encoding.UTF8;
        Header();

        if (debug)
        {
            await SyncOnce(debug: true);
            return;
        }

        Console.WriteLine("Pulsa S para sincronizar ahora, Q para salir.");
        Console.WriteLine();
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_config.AutoSyncSeconds));
        _ = Task.Run(async () =>
        {
            while (await timer.WaitForNextTickAsync())
            {
                try { await SyncOnce(debug: false); }
                catch (Exception ex) { Log("ERROR auto-sync: " + ex.Message); }
            }
        });

        while (true)
        {
            var key = Console.ReadKey(intercept: true).Key;
            if (key == ConsoleKey.Q) break;
            if (key == ConsoleKey.S) await SyncOnce(debug: false);
        }
    }

    private void Header()
    {
        Console.WriteLine("🐦 Colibrí Engine 3.0.2 - NUMIER LIVE + Estado del Servicio");
        Console.WriteLine("------------------------------------------------");
        Console.WriteLine($"Empresa: {_config.BusinessName}");
        Console.WriteLine($"Ruta NUMIER: {_config.NumierPath}");
        Console.WriteLine($"Archivos: {_config.CabeceraFile} / {_config.DetalleFile} / {_config.ArticulosFile}");
        Console.WriteLine($"Auto-sync: cada {_config.AutoSyncSeconds}s · Límite: {_config.MaxTicketsPerSync} tickets");
        Console.WriteLine();
    }

    private async Task SyncOnce(bool debug)
    {
        Log("Comprobando NUMIER...");
        string cabPath = Path.Combine(_config.NumierPath, _config.CabeceraFile);
        string detPath = Path.Combine(_config.NumierPath, _config.DetalleFile);
        string artPath = Path.Combine(_config.NumierPath, _config.ArticulosFile);
        if (!File.Exists(cabPath)) { Log("ERROR: no existe " + cabPath); return; }
        if (!File.Exists(detPath)) { Log("ERROR: no existe " + detPath); return; }
        bool hasArticulos = File.Exists(artPath);
        if (!hasArticulos) Log("AVISO: no existe " + artPath + ". Se usarán descripciones de detalle.");

        var cabInfo = new FileInfo(cabPath);
        var detInfo = new FileInfo(detPath);
        FileInfo? artInfo = hasArticulos ? new FileInfo(artPath) : null;
        Log($"OK cabecera: {cabInfo.Length:N0} bytes · modificado {cabInfo.LastWriteTime:dd/MM/yyyy HH:mm:ss}");
        Log($"OK detalle: {detInfo.Length:N0} bytes · modificado {detInfo.LastWriteTime:dd/MM/yyyy HH:mm:ss}");
        if (artInfo != null) Log($"OK artículos: {artInfo.Length:N0} bytes · modificado {artInfo.LastWriteTime:dd/MM/yyyy HH:mm:ss}");

        var sw = Stopwatch.StartNew();
        using var api = SupabaseRest.Create(_config);
        var lastCabId = await api.GetLastCabIdAsync();
        Log($"Último CAB_ID en Supabase: {lastCabId}");

        using var snapshot = SafeDbfSnapshot.Create(cabPath, detPath, hasArticulos ? artPath : null, Log);
        var cabDbf = DbfTable.Open(snapshot.CabeceraPath);
        var detDbf = DbfTable.Open(snapshot.DetallePath);
        DbfTable? artDbf = snapshot.ArticulosPath != null ? DbfTable.Open(snapshot.ArticulosPath) : null;
        var articleMap = new Dictionary<string, ArticleDto>(StringComparer.OrdinalIgnoreCase);
        if (artDbf != null)
        {
            articleMap = BuildArticles(artDbf, Log);
            await api.UpsertArticlesAsync(articleMap.Values);
            if (artInfo != null) await api.UpsertSyncFileAsync(_config.ArticulosFile, artInfo.Length, artInfo.LastWriteTimeUtc);
            Log($"Artículos sincronizados: {articleMap.Count:N0}");
        }

        if (debug)
        {
            Log("Campos cabecera: " + string.Join(", ", cabDbf.Fields.Select(f => $"{f.Name}:{f.Type}")));
            Log("Campos detalle: " + string.Join(", ", detDbf.Fields.Select(f => $"{f.Name}:{f.Type}")));
            if (artDbf != null) Log("Campos artículos: " + string.Join(", ", artDbf.Fields.Select(f => $"{f.Name}:{f.Type}")));
        }

        // Estado del Servicio LIVE: leer cuentas abiertas (CAB_ESTADO = P)
        var openAccounts = new List<OpenAccountDto>();
        var openIds = new HashSet<long>();
        foreach (var rec in cabDbf.Records())
        {
            long cabId = rec.GetLong("CAB_ID");
            string estado = FirstNonEmpty(rec.GetString("CAB_ESTADO"), rec.GetString("CAB_EST"));
            if (!estado.Equals("P", StringComparison.OrdinalIgnoreCase)) continue;

            var fecha = rec.GetDate("CAB_FECHA") ?? DateTime.Today;
            var hora = rec.GetVfpDateTime("CAB_HORA") ?? fecha;
            string mesaRaw = FirstNonEmpty(rec.GetString("CAB_MESA"), rec.GetString("CABMESA"), rec.GetString("MESA"));
            int mesaNum = ParseMesa(mesaRaw);
            string zona = ZoneForMesa(mesaNum);
            decimal totalCab = FirstDecimal(rec, new [] { "CAB_TOTAL", "CAB_TOT", "CAB_IMPOR", "CAB_IMPORTE", "TOTAL" });
            string numdoc = FirstNonEmpty(rec.GetString("CAB_NUMDOC"), rec.GetString("NUMDOC"));

            openIds.Add(cabId);
            openAccounts.Add(new OpenAccountDto
            {
                CabId = cabId,
                Mesa = mesaRaw,
                MesaNumero = mesaNum,
                Zona = zona,
                OpenedAt = hora.ToUniversalTime().ToString("O"),
                Numdoc = numdoc,
                Status = estado,
                Total = totalCab,
                LastSeenAt = DateTime.UtcNow.ToString("O")
            });
        }

        if (openAccounts.Count > 0)
        {
            var openTotals = new Dictionary<long, decimal>();
            foreach (var r in detDbf.Records())
            {
                long cabId = r.GetLong("DET_ID");
                if (!openIds.Contains(cabId)) continue;
                openTotals[cabId] = openTotals.GetValueOrDefault(cabId) + r.GetDecimal("DET_IMPORT");
            }
            foreach (var oa in openAccounts)
            {
                if (oa.Total <= 0 && openTotals.TryGetValue(oa.CabId, out var tv)) oa.Total = tv;
            }
        }
        await api.UpsertOpenAccountsAsync(openAccounts);
        await api.MarkOpenAccountsSnapshotAsync();
        Log($"Estado del servicio: {openAccounts.Count:N0} cuentas abiertas. Pendiente: {openAccounts.Sum(o=>o.Total):N2} €");

        var newTickets = new List<TicketDto>();
        long maxCabSeen = lastCabId;
        int scanned = 0, totalCobrados = 0, importedCobrados = 0;
        foreach (var rec in cabDbf.Records())
        {
            scanned++;
            long cabId = rec.GetLong("CAB_ID");
            maxCabSeen = Math.Max(maxCabSeen, cabId);
            string estado = rec.GetString("CAB_ESTADO");
            if (!estado.Equals("C", StringComparison.OrdinalIgnoreCase)) continue;
            totalCobrados++;
            if (cabId <= lastCabId) { importedCobrados++; continue; }

            if (newTickets.Count < _config.MaxTicketsPerSync)
            {
                var fecha = rec.GetDate("CAB_FECHA") ?? DateTime.Today;
                var hora = rec.GetVfpDateTime("CAB_HORA") ?? fecha;
                string numdoc = rec.GetString("CAB_NUMDOC");
                string forma = rec.GetString("CAB_COBRO");
                decimal tarjeta = rec.GetDecimal("CAB_ENT_TA");
                decimal cheque = rec.GetDecimal("CAB_ENT_CH");

                newTickets.Add(new TicketDto
                {
                    CabId = cabId,
                    Fecha = fecha.ToString("yyyy-MM-dd"),
                    Hora = hora.ToUniversalTime().ToString("O"),
                    Estado = estado,
                    FormaPago = forma,
                    Numdoc = numdoc,
                    Tarjeta = tarjeta,
                    Cheque = cheque
                });
            }
        }

        var processedBeforeBatch = importedCobrados;
        var processedAfterBatchEstimate = Math.Min(totalCobrados, importedCobrados + newTickets.Count);
        var pctBefore = totalCobrados == 0 ? 100m : Math.Round((decimal)processedBeforeBatch * 100m / totalCobrados, 2);
        Log($"Cabeceras escaneadas: {scanned:N0}. Cobrados totales: {totalCobrados:N0}. Importados: {processedBeforeBatch:N0} ({pctBefore:N2}%). Nuevos detectados: {newTickets.Count:N0}. Último CAB_ID visto: {maxCabSeen}");
        if (newTickets.Count == 0)
        {
            await api.UpsertSyncFileAsync(_config.CabeceraFile, cabInfo.Length, cabInfo.LastWriteTimeUtc);
            await api.UpsertSyncFileAsync(_config.DetalleFile, detInfo.Length, detInfo.LastWriteTimeUtc);
            await api.UpsertSyncStatusAsync(new SyncStatusDto
            {
                BusinessName = _config.BusinessName,
                Mode = "LIVE",
                ProgressPercent = 100,
                ProcessedTickets = totalCobrados,
                TotalTickets = totalCobrados,
                PendingTickets = 0,
                LastCabId = lastCabId,
                MaxCabId = maxCabSeen,
                LastBatchTickets = 0,
                LastBatchLines = 0,
                Message = "ACTUALIZADO 100% · ERP en tiempo real"
            });
            Log("ACTUALIZADO 100%. Sin tickets nuevos. Modo LIVE.");
            return;
        }

        var ids = newTickets.Select(t => t.CabId).ToHashSet();
        var lines = new List<TicketLineDto>();
        var totals = new Dictionary<long, decimal>();
        int detailScanned = 0;
        foreach (var r in detDbf.Records())
        {
            detailScanned++;
            long cabId = r.GetLong("DET_ID");
            if (!ids.Contains(cabId)) continue;

            decimal importe = r.GetDecimal("DET_IMPORT");
            totals[cabId] = totals.GetValueOrDefault(cabId) + importe;
            var lineId = r.GetLong("ID");
            if (lineId <= 0) lineId = detailScanned;

            lines.Add(new TicketLineDto
            {
                CabId = cabId,
                LineKey = $"{cabId}-{lineId}",
                Articulo = r.GetString("DET_ARTICU"),
                Descripcion = ArticleName(articleMap, r.GetString("DET_ARTICU"), FirstNonEmpty(r.GetString("DET_CAD_PR"), r.GetString("DET_OPCION"))),
                Cantidad = r.GetDecimal("DET_CANTID"),
                Precio = r.GetDecimal("DET_PRECIO"),
                Importe = importe,
                Iva = r.GetDecimal("DET_TIPO_I")
            });
        }

        foreach (var t in newTickets)
        {
            t.Total = totals.GetValueOrDefault(t.CabId);
            if (t.Tarjeta > 0 || t.Cheque > 0)
            {
                t.Efectivo = Math.Max(0, t.Total - t.Tarjeta - t.Cheque);
            }
            else
            {
                t.Efectivo = t.Total;
            }
        }

        Log($"Líneas nuevas detectadas: {lines.Count:N0}");
        await api.UpsertTicketsAsync(newTickets);
        await api.UpsertLinesAsync(lines);
        await api.UpsertSyncFileAsync(_config.CabeceraFile, cabInfo.Length, cabInfo.LastWriteTimeUtc);
        await api.UpsertSyncFileAsync(_config.DetalleFile, detInfo.Length, detInfo.LastWriteTimeUtc);
        sw.Stop();
        var processedAfter = Math.Min(totalCobrados, importedCobrados + newTickets.Count);
        var pending = Math.Max(0, totalCobrados - processedAfter);
        var pct = totalCobrados == 0 ? 100m : Math.Round((decimal)processedAfter * 100m / totalCobrados, 2);
        var mode = pending == 0 ? "LIVE" : "SINCRONIZANDO";
        await api.UpsertSyncStatusAsync(new SyncStatusDto
        {
            BusinessName = _config.BusinessName,
            Mode = mode,
            ProgressPercent = pct,
            ProcessedTickets = processedAfter,
            TotalTickets = totalCobrados,
            PendingTickets = pending,
            LastCabId = newTickets.Max(t => t.CabId),
            MaxCabId = maxCabSeen,
            LastBatchTickets = newTickets.Count,
            LastBatchLines = lines.Count,
            Message = pending == 0 ? "ACTUALIZADO 100% · ERP en tiempo real" : $"SINCRONIZANDO {pct:N1}% · quedan {pending:N0} tickets"
        });
        Log($"Sincronizados {newTickets.Count:N0} tickets y {lines.Count:N0} líneas. Progreso: {pct:N2}% ({processedAfter:N0}/{totalCobrados:N0}). Pendientes: {pending:N0}. Tiempo: {sw.Elapsed.TotalSeconds:N1}s");
    }


    private static Dictionary<string, ArticleDto> BuildArticles(DbfTable artDbf, Action<string> log)
    {
        string codeField = FindField(artDbf, new[] { "ART_CODIGO", "ARTICULO", "CODIGO", "ART_COD", "COD_ART", "ID" }, new[] { "COD", "ART" }) ?? "";
        string nameField = FindField(artDbf, new[] { "ART_NOMBRE", "ART_DESCRI", "DESCRIP", "DESCRIPCIO", "DESCRIPCION", "NOMBRE", "TITULO" }, new[] { "DES", "NOM" }) ?? "";
        string familyField = FindField(artDbf, new[] { "FAMILIA", "ART_FAMIL", "CATEGORIA", "CAT", "GRUPO" }, new[] { "FAM", "CAT", "GRU" }) ?? "";
        string priceField = FindField(artDbf, new[] { "PRECIO", "PVP", "ART_PVP", "PVENTA", "VENTA" }, new[] { "PVP", "PREC" }) ?? "";
        string ivaField = FindField(artDbf, new[] { "IVA", "TIPO_IVA", "ART_IVA", "TIPO_I" }, new[] { "IVA" }) ?? "";
        log($"Mapeo artículos: código={codeField}, nombre={nameField}, familia={familyField}, precio={priceField}, iva={ivaField}");
        var map = new Dictionary<string, ArticleDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in artDbf.Records())
        {
            var code = !string.IsNullOrWhiteSpace(codeField) ? r.GetString(codeField) : "";
            if (string.IsNullOrWhiteSpace(code)) continue;
            var name = !string.IsNullOrWhiteSpace(nameField) ? r.GetString(nameField) : code;
            var family = !string.IsNullOrWhiteSpace(familyField) ? r.GetString(familyField) : "";
            var price = !string.IsNullOrWhiteSpace(priceField) ? r.GetDecimal(priceField) : 0;
            var iva = !string.IsNullOrWhiteSpace(ivaField) ? r.GetDecimal(ivaField) : 0;
            map[code.Trim()] = new ArticleDto { ArticleCode = code.Trim(), ArticleName = string.IsNullOrWhiteSpace(name) ? code.Trim() : name.Trim(), Family = family.Trim(), Price = price, Iva = iva };
        }
        return map;
    }

    private static string? FindField(DbfTable table, string[] exactCandidates, string[] containsCandidates)
    {
        var names = table.Fields.Select(f => f.Name).ToList();
        foreach (var c in exactCandidates)
        {
            var hit = names.FirstOrDefault(n => n.Equals(c, StringComparison.OrdinalIgnoreCase));
            if (hit != null) return hit;
        }
        foreach (var c in containsCandidates)
        {
            var hit = names.FirstOrDefault(n => n.Contains(c, StringComparison.OrdinalIgnoreCase));
            if (hit != null) return hit;
        }
        return null;
    }


    private static int ParseMesa(string mesaRaw)
    {
        var s = new string((mesaRaw ?? "").Where(char.IsDigit).ToArray());
        return int.TryParse(s, out var n) ? n : 0;
    }

    private static string ZoneForMesa(int mesa)
    {
        if (mesa >= 0 && mesa <= 19) return "terraza";
        if (mesa >= 20 && mesa <= 30) return "salon";
        return "barra";
    }

    private static decimal FirstDecimal(DbfRecord rec, string[] names)
    {
        foreach (var n in names)
        {
            var v = rec.GetDecimal(n);
            if (v != 0) return v;
        }
        return 0;
    }

    private static string ArticleName(Dictionary<string, ArticleDto> map, string code, string fallback)
    {
        code = (code ?? "").Trim();
        if (!string.IsNullOrWhiteSpace(code) && map.TryGetValue(code, out var art) && !string.IsNullOrWhiteSpace(art.ArticleName)) return art.ArticleName;
        return string.IsNullOrWhiteSpace(fallback) ? code : fallback;
    }

    private static string FirstNonEmpty(params string[] values) => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? "";
    private static void Log(string msg) => Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {msg}");
}


public sealed class SafeDbfSnapshot : IDisposable
{
    public string CabeceraPath { get; }
    public string DetallePath { get; }
    public string? ArticulosPath { get; }
    private readonly string _dir;

    private SafeDbfSnapshot(string dir, string cabeceraPath, string detallePath, string? articulosPath)
    {
        _dir = dir;
        CabeceraPath = cabeceraPath;
        DetallePath = detallePath;
        ArticulosPath = articulosPath;
    }

    public static SafeDbfSnapshot Create(string cabeceraSource, string detalleSource, string? articulosSource, Action<string> log)
    {
        string baseDir = Path.Combine(Path.GetTempPath(), "ColibriSync", "snapshots", DateTime.Now.ToString("yyyyMMdd_HHmmss_fff"));
        Directory.CreateDirectory(baseDir);
        string cabDest = Path.Combine(baseDir, Path.GetFileName(cabeceraSource));
        string detDest = Path.Combine(baseDir, Path.GetFileName(detalleSource));
        string? artDest = articulosSource != null ? Path.Combine(baseDir, Path.GetFileName(articulosSource)) : null;
        CopyWithRetries(cabeceraSource, cabDest, log);
        CopyWithRetries(detalleSource, detDest, log);
        if (articulosSource != null && artDest != null) CopyWithRetries(articulosSource, artDest, log);
        log("Copia temporal segura creada. NUMIER puede seguir abierto.");
        return new SafeDbfSnapshot(baseDir, cabDest, detDest, artDest);
    }

    private static void CopyWithRetries(string source, string dest, Action<string> log)
    {
        Exception? last = null;
        for (int attempt = 1; attempt <= 8; attempt++)
        {
            try
            {
                using var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, bufferSize: 1024 * 1024);
                using var output = new FileStream(dest, FileMode.Create, FileAccess.Write, FileShare.None, bufferSize: 1024 * 1024);
                input.CopyTo(output);
                return;
            }
            catch (Exception ex)
            {
                last = ex;
                log($"NUMIER ocupado o archivo bloqueado. Reintento {attempt}/8: {Path.GetFileName(source)}");
                Thread.Sleep(1500);
            }
        }
        throw new IOException($"No se pudo copiar {source}. Último error: {last?.Message}", last);
    }

    public void Dispose()
    {
        try { if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true); } catch { }
    }
}

public sealed record SyncConfig
{
    public string NumierPath { get; init; } = @"C:\NUMIER\DATOS";
    public string CabeceraFile { get; init; } = "cabecera.DBF";
    public string DetalleFile { get; init; } = "detalle.DBF";
    public string ArticulosFile { get; init; } = "articulos.DBF";
    public string SupabaseUrl { get; init; } = "https://xccyaoziutlxxklcofrw.supabase.co";
    public string SupabaseAnonKey { get; init; } = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjY3lhb3ppdXRseHhrbGNvZnJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNzg4NTYsImV4cCI6MjA5ODg1NDg1Nn0.gJHhvB_cVsiqirPesHdSoBwWBKzzsXSveZ-WXla3aSs";
    public int AutoSyncSeconds { get; init; } = 60;
    public int MaxTicketsPerSync { get; init; } = 500;
    public string BusinessName { get; init; } = "Brasería El Colibrí";
    public static SyncConfig Default() => new();
}

public sealed class SupabaseRest : IDisposable
{
    private readonly HttpClient _http;
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };
    private SupabaseRest(SyncConfig cfg)
    {
        _http = new HttpClient { BaseAddress = new Uri(cfg.SupabaseUrl.TrimEnd('/') + "/rest/v1/") };
        _http.DefaultRequestHeaders.Add("apikey", cfg.SupabaseAnonKey);
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", cfg.SupabaseAnonKey);
    }
    public static SupabaseRest Create(SyncConfig cfg) => new(cfg);
    public void Dispose() => _http.Dispose();

    public async Task<long> GetLastCabIdAsync()
    {
        var resp = await _http.GetAsync("numier_tickets?select=cab_id&order=cab_id.desc&limit=1");
        var txt = await resp.Content.ReadAsStringAsync();
        if (!resp.IsSuccessStatusCode) throw new Exception("Supabase last CAB_ID: " + txt);
        using var doc = JsonDocument.Parse(txt);
        if (doc.RootElement.GetArrayLength() == 0) return 0;
        return doc.RootElement[0].GetProperty("cab_id").GetInt64();
    }

    public async Task UpsertTicketsAsync(IEnumerable<TicketDto> rows) => await Upsert("numier_tickets", "cab_id", rows);
    public async Task UpsertLinesAsync(IEnumerable<TicketLineDto> rows) => await Upsert("numier_ticket_lines", "line_key", rows);
    public async Task UpsertArticlesAsync(IEnumerable<ArticleDto> rows) => await Upsert("numier_articles", "article_code", rows);
    public async Task UpsertOpenAccountsAsync(IEnumerable<OpenAccountDto> rows) => await Upsert("numier_open_accounts", "cab_id", rows);
    public async Task MarkOpenAccountsSnapshotAsync()
    {
        var row = new[] { new ServiceStatusDto { StatusKey = "service", UpdatedAt = DateTime.UtcNow.ToString("O") } };
        await Upsert("numier_service_status", "status_key", row);
    }
    public async Task UpsertSyncFileAsync(string fileName, long size, DateTime modifiedUtc)
    {
        var row = new[] { new SyncFileDto { Source = "numier", FileName = fileName, FileSize = size, ModifiedAt = modifiedUtc.ToString("O"), SyncedAt = DateTime.UtcNow.ToString("O") } };
        await Upsert("numier_sync_files", "source,file_name", row);
    }
    public async Task UpsertSyncStatusAsync(SyncStatusDto status)
    {
        status.StatusKey = "numier";
        status.UpdatedAt = DateTime.UtcNow.ToString("O");
        await Upsert("numier_sync_status", "status_key", new[] { status });
    }

    private async Task Upsert<T>(string table, string conflict, IEnumerable<T> rows)
    {
        var list = rows.ToList();
        if (list.Count == 0) return;
        var req = new HttpRequestMessage(HttpMethod.Post, $"{table}?on_conflict={Uri.EscapeDataString(conflict)}");
        req.Headers.Add("Prefer", "resolution=merge-duplicates,return=minimal");
        req.Content = new StringContent(JsonSerializer.Serialize(list, _json), Encoding.UTF8, "application/json");
        var resp = await _http.SendAsync(req);
        var txt = await resp.Content.ReadAsStringAsync();
        if (!resp.IsSuccessStatusCode) throw new Exception($"Supabase {table}: {txt}");
    }
}

public sealed class ArticleDto
{
    [JsonPropertyName("article_code")] public string ArticleCode { get; set; } = "";
    [JsonPropertyName("article_name")] public string ArticleName { get; set; } = "";
    [JsonPropertyName("family")] public string? Family { get; set; }
    [JsonPropertyName("category_code")] public string? CategoryCode { get; set; }
    [JsonPropertyName("price")] public decimal Price { get; set; }
    [JsonPropertyName("iva")] public decimal Iva { get; set; }
    [JsonPropertyName("active")] public bool Active { get; set; } = true;
}

public sealed class TicketDto
{
    [JsonPropertyName("cab_id")] public long CabId { get; set; }
    [JsonPropertyName("fecha")] public string? Fecha { get; set; }
    [JsonPropertyName("hora")] public string? Hora { get; set; }
    [JsonPropertyName("estado")] public string? Estado { get; set; }
    [JsonPropertyName("forma_pago")] public string? FormaPago { get; set; }
    [JsonPropertyName("numdoc")] public string? Numdoc { get; set; }
    [JsonPropertyName("total")] public decimal Total { get; set; }
    [JsonPropertyName("efectivo")] public decimal Efectivo { get; set; }
    [JsonPropertyName("tarjeta")] public decimal Tarjeta { get; set; }
    [JsonPropertyName("cheque")] public decimal Cheque { get; set; }
}
public sealed class TicketLineDto
{
    [JsonPropertyName("cab_id")] public long CabId { get; set; }
    [JsonPropertyName("line_key")] public string LineKey { get; set; } = "";
    [JsonPropertyName("articulo")] public string? Articulo { get; set; }
    [JsonPropertyName("descripcion")] public string? Descripcion { get; set; }
    [JsonPropertyName("cantidad")] public decimal Cantidad { get; set; }
    [JsonPropertyName("precio")] public decimal Precio { get; set; }
    [JsonPropertyName("importe")] public decimal Importe { get; set; }
    [JsonPropertyName("iva")] public decimal Iva { get; set; }
}
public sealed class OpenAccountDto
{
    [JsonPropertyName("cab_id")] public long CabId { get; set; }
    [JsonPropertyName("mesa")] public string? Mesa { get; set; }
    [JsonPropertyName("mesa_numero")] public int MesaNumero { get; set; }
    [JsonPropertyName("zona")] public string? Zona { get; set; }
    [JsonPropertyName("opened_at")] public string? OpenedAt { get; set; }
    [JsonPropertyName("numdoc")] public string? Numdoc { get; set; }
    [JsonPropertyName("status")] public string? Status { get; set; }
    [JsonPropertyName("total")] public decimal Total { get; set; }
    [JsonPropertyName("last_seen_at")] public string? LastSeenAt { get; set; }
}
public sealed class ServiceStatusDto
{
    [JsonPropertyName("status_key")] public string StatusKey { get; set; } = "service";
    [JsonPropertyName("updated_at")] public string? UpdatedAt { get; set; }
}
public sealed class SyncFileDto
{
    [JsonPropertyName("source")] public string Source { get; set; } = "numier";
    [JsonPropertyName("file_name")] public string FileName { get; set; } = "";
    [JsonPropertyName("file_size")] public long FileSize { get; set; }
    [JsonPropertyName("modified_at")] public string? ModifiedAt { get; set; }
    [JsonPropertyName("synced_at")] public string? SyncedAt { get; set; }
}
public sealed class SyncStatusDto
{
    [JsonPropertyName("status_key")] public string StatusKey { get; set; } = "numier";
    [JsonPropertyName("business_name")] public string BusinessName { get; set; } = "Brasería El Colibrí";
    [JsonPropertyName("mode")] public string Mode { get; set; } = "SINCRONIZANDO";
    [JsonPropertyName("progress_percent")] public decimal ProgressPercent { get; set; }
    [JsonPropertyName("processed_tickets")] public long ProcessedTickets { get; set; }
    [JsonPropertyName("total_tickets")] public long TotalTickets { get; set; }
    [JsonPropertyName("pending_tickets")] public long PendingTickets { get; set; }
    [JsonPropertyName("last_cab_id")] public long LastCabId { get; set; }
    [JsonPropertyName("max_cab_id")] public long MaxCabId { get; set; }
    [JsonPropertyName("last_batch_tickets")] public int LastBatchTickets { get; set; }
    [JsonPropertyName("last_batch_lines")] public int LastBatchLines { get; set; }
    [JsonPropertyName("message")] public string? Message { get; set; }
    [JsonPropertyName("updated_at")] public string? UpdatedAt { get; set; }
}

public sealed class DbfTable
{
    public string Path { get; }
    public List<DbfField> Fields { get; } = new();
    public int HeaderLength { get; private set; }
    public int RecordLength { get; private set; }
    public int RecordCount { get; private set; }
    private DbfTable(string path) { Path = path; }
    public static DbfTable Open(string path)
    {
        var t = new DbfTable(path);
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        Span<byte> header = stackalloc byte[32];
        fs.ReadExactly(header);
        t.RecordCount = BitConverter.ToInt32(header.Slice(4, 4));
        t.HeaderLength = BitConverter.ToUInt16(header.Slice(8, 2));
        t.RecordLength = BitConverter.ToUInt16(header.Slice(10, 2));
        int offset = 1;
        while (true)
        {
            var fd = new byte[32];
            fs.ReadExactly(fd);
            if (fd[0] == 0x0D) break;
            string name = Encoding.ASCII.GetString(fd, 0, 11).Split('\0')[0].Trim();
            char type = (char)fd[11];
            int len = fd[16];
            int dec = fd[17];
            t.Fields.Add(new DbfField(name, type, len, dec, offset));
            offset += len;
        }
        return t;
    }
    public IEnumerable<DbfRecord> Records()
    {
        using var fs = new FileStream(Path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        fs.Position = HeaderLength;
        var buffer = new byte[RecordLength];
        for (int i = 0; i < RecordCount; i++)
        {
            int read = fs.Read(buffer, 0, buffer.Length);
            if (read < buffer.Length) yield break;
            if (buffer[0] == 0x2A) continue;
            yield return new DbfRecord(Fields, (byte[])buffer.Clone());
        }
    }
}
public sealed record DbfField(string Name, char Type, int Length, int DecimalCount, int Offset);
public sealed class DbfRecord
{
    private readonly Dictionary<string, DbfField> _fields;
    private readonly byte[] _data;
    private static readonly Encoding Ansi = Encoding.GetEncoding(1252);
    public DbfRecord(IEnumerable<DbfField> fields, byte[] data)
    {
        _fields = fields.ToDictionary(f => f.Name.ToUpperInvariant());
        _data = data;
    }
    public string GetString(string name)
    {
        if (!_fields.TryGetValue(name.ToUpperInvariant(), out var f)) return "";
        return Ansi.GetString(_data, f.Offset, f.Length).Trim('\0', ' ');
    }
    public long GetLong(string name)
    {
        if (!_fields.TryGetValue(name.ToUpperInvariant(), out var f)) return 0;
        if (f.Type == 'I') return BitConverter.ToInt32(_data, f.Offset);
        if (long.TryParse(GetString(name), NumberStyles.Any, CultureInfo.InvariantCulture, out var v)) return v;
        if (long.TryParse(GetString(name).Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out v)) return v;
        return 0;
    }
    public decimal GetDecimal(string name)
    {
        if (!_fields.TryGetValue(name.ToUpperInvariant(), out var f)) return 0;
        if (f.Type == 'I') return BitConverter.ToInt32(_data, f.Offset);
        if (f.Type == 'B' || f.Type == 'F')
        {
            var s = GetString(name).Replace(',', '.');
            if (decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var dv)) return dv;
        }
        var raw = GetString(name).Replace(',', '.');
        return decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : 0;
    }
    public DateTime? GetDate(string name)
    {
        var s = GetString(name);
        if (DateTime.TryParseExact(s, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) return d;
        return null;
    }
    public DateTime? GetVfpDateTime(string name)
    {
        if (!_fields.TryGetValue(name.ToUpperInvariant(), out var f) || f.Type != 'T' || f.Length < 8) return null;
        int julian = BitConverter.ToInt32(_data, f.Offset);
        int ms = BitConverter.ToInt32(_data, f.Offset + 4);
        if (julian <= 0) return null;
        try
        {
            var date = DateTime.FromOADate(julian - 2415018.5);
            return date.Date.AddMilliseconds(ms);
        }
        catch { return null; }
    }
}
