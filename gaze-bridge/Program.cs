using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace GazeBridge;

public static class Program
{
    private const string HttpPrefix = "http://127.0.0.1:8765/";
    private static readonly List<WebSocket> Clients = new();
    private static readonly object ClientsLock = new();

    private static volatile bool _triggerEnabled;
    private static int _triggerHz = 30;

    public static async Task Main(string[] args)
    {
        var sourceName = ParseStringArg(args, "--source", "mouse");
        _triggerHz = Math.Clamp(int.TryParse(ParseStringArg(args, "--trigger-hz", "30"), out var hz) ? hz : 30, 1, 200);

        using IGazeSource source = CreateSource(sourceName);
        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

        var http = new HttpListener();
        http.Prefixes.Add(HttpPrefix);
        http.Start();
        Console.WriteLine($"GazeBridge in ascolto su ws://127.0.0.1:8765/");
        Console.WriteLine($"Sorgente gaze: {source.Name}");
        Console.WriteLine($"F1 trigger: {_triggerHz} Hz (attivato da comando WebSocket).");
        Console.WriteLine("Ctrl+C per uscire.");

        var accept = AcceptLoop(http, cts.Token);
        var gaze = GazeLoop(source, cts.Token);
        var trigger = TriggerLoop(cts.Token);

        await Task.WhenAny(accept, gaze, trigger);
        cts.Cancel();
        http.Stop();
    }

    private static string ParseStringArg(string[] args, string name, string defaultValue)
    {
        var prefix = name + "=";
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == name && i + 1 < args.Length) return args[i + 1];
            if (args[i].StartsWith(prefix)) return args[i].Substring(prefix.Length);
        }
        return defaultValue;
    }

    private static IGazeSource CreateSource(string name) => name.ToLowerInvariant() switch
    {
        "mouse" => new MouseGazeSource(),
        "sim" => new SimGazeSource(),
        "tobii" => new TobiiGazeSource(),
        _ => throw new ArgumentException($"Sorgente sconosciuta: {name}. Valori validi: mouse|sim|tobii")
    };

    private static async Task AcceptLoop(HttpListener http, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            HttpListenerContext ctx;
            try { ctx = await http.GetContextAsync(); }
            catch { break; }

            if (!ctx.Request.IsWebSocketRequest)
            {
                ctx.Response.StatusCode = 400;
                ctx.Response.Close();
                continue;
            }

            var wsCtx = await ctx.AcceptWebSocketAsync(null);
            var ws = wsCtx.WebSocket;
            lock (ClientsLock) { Clients.Add(ws); }
            Console.WriteLine($"Client connesso (tot: {Clients.Count}).");
            _ = ReadLoop(ws);
        }
    }

    private static async Task ReadLoop(WebSocket ws)
    {
        var buf = new byte[4096];
        var msg = new MemoryStream();
        try
        {
            while (ws.State == WebSocketState.Open)
            {
                msg.SetLength(0);
                WebSocketReceiveResult r;
                do
                {
                    r = await ws.ReceiveAsync(buf, CancellationToken.None);
                    if (r.MessageType == WebSocketMessageType.Close) return;
                    msg.Write(buf, 0, r.Count);
                } while (!r.EndOfMessage);

                if (r.MessageType == WebSocketMessageType.Text)
                {
                    var text = Encoding.UTF8.GetString(msg.GetBuffer(), 0, (int)msg.Length);
                    HandleCommand(text);
                }
            }
        }
        catch { }
        finally
        {
            int remaining;
            lock (ClientsLock) { Clients.Remove(ws); remaining = Clients.Count; }
            if (remaining == 0 && _triggerEnabled)
            {
                _triggerEnabled = false;
                Console.WriteLine("Nessun client connesso: trigger F1 fermato.");
            }
            try { ws.Dispose(); } catch { }
            Console.WriteLine($"Client disconnesso (tot: {remaining}).");
        }
    }

    private static void HandleCommand(string text)
    {
        try
        {
            using var doc = JsonDocument.Parse(text);
            if (!doc.RootElement.TryGetProperty("cmd", out var cmdEl)) return;
            var cmd = cmdEl.GetString();
            switch (cmd)
            {
                case "trigger-start":
                    if (!_triggerEnabled) { _triggerEnabled = true; Console.WriteLine($"Trigger F1 ON ({_triggerHz} Hz)."); }
                    break;
                case "trigger-stop":
                    if (_triggerEnabled) { _triggerEnabled = false; Console.WriteLine("Trigger F1 OFF."); }
                    break;
            }
        }
        catch { }
    }

    private static async Task GazeLoop(IGazeSource source, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            source.Update();
            if (source.IsConnected && source.TryGetNormalizedGaze(out var nx, out var ny))
            {
                var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                await Broadcast(new
                {
                    type = "gaze",
                    ts,
                    x = nx,
                    y = ny,
                    valid = true
                });
            }
            try { await Task.Delay(10, ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    private static async Task TriggerLoop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            if (_triggerEnabled)
            {
                try { KeySender.Tap(KeySender.VK_F1); }
                catch (Exception ex) { Console.WriteLine($"SendInput F1 errore: {ex.Message}"); }
                var delayMs = Math.Max(1, 1000 / _triggerHz);
                try { await Task.Delay(delayMs, ct); }
                catch (OperationCanceledException) { break; }
            }
            else
            {
                try { await Task.Delay(50, ct); }
                catch (OperationCanceledException) { break; }
            }
        }
    }

    private static async Task Broadcast(object payload)
    {
        var json = JsonSerializer.Serialize(payload);
        var bytes = Encoding.UTF8.GetBytes(json);
        var seg = new ArraySegment<byte>(bytes);

        List<WebSocket> snap;
        lock (ClientsLock) { snap = Clients.ToList(); }

        var dead = new List<WebSocket>();
        foreach (var ws in snap)
        {
            try
            {
                if (ws.State == WebSocketState.Open)
                    await ws.SendAsync(seg, WebSocketMessageType.Text, true, CancellationToken.None);
                else
                    dead.Add(ws);
            }
            catch { dead.Add(ws); }
        }

        if (dead.Count > 0)
        {
            lock (ClientsLock)
            {
                foreach (var d in dead) Clients.Remove(d);
            }
        }
    }
}
