using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.Net.WebSockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace BlumMods.ShredABillion
{
    internal class Command
    {
        public string Name;
        public string Viewer;
        string _json;
        public Command(string json)
        {
            _json = json;
            Name = Str("command");
            Viewer = Str("nickname");
            if (string.IsNullOrEmpty(Viewer)) Viewer = Str("user");
        }
        string Str(string key)
        {
            var m = Regex.Match(_json, "\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
            return m.Success ? Regex.Unescape(m.Groups[1].Value) : "";
        }
        // Parameters arrive as "p_<name>": number
        public double Num(string name, double fallback)
        {
            var m = Regex.Match(_json, "\"p_" + name + "\"\\s*:\\s*\"?(-?[0-9]+(?:\\.[0-9]+)?(?:[eE][-+]?[0-9]+)?)");
            return m.Success && double.TryParse(m.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : fallback;
        }
    }

    // Talks to the BlumMods app on this PC. Runs on its own thread; game code only ever touches the queues.
    internal static class Bridge
    {
        const string Url = "ws://127.0.0.1:21777/mods";
        internal static readonly ConcurrentQueue<Command> Incoming = new ConcurrentQueue<Command>();
        static readonly ConcurrentQueue<string> Outgoing = new ConcurrentQueue<string>();
        static bool _started;

        internal static void Start()
        {
            if (_started) return;
            _started = true;
            // The loop must never end: if anything escapes it, log it and start it again.
            var t = new Thread(() =>
            {
                while (true)
                {
                    try { Loop().GetAwaiter().GetResult(); }
                    catch (Exception e) { try { Plugin.L.LogError("Bridge crashed, restarting: " + e); } catch { } }
                    Thread.Sleep(3000);
                }
            });
            t.IsBackground = true;
            t.Name = "BlumMods bridge";
            t.Start();
        }

        // A ready-made JSON message for the app (the jail timer uses it).
        internal static void Send(string json)
        {
            if (Outgoing.Count < 200) Outgoing.Enqueue(json);
        }

        internal static void Log(string text)
        {
            if (Outgoing.Count < 200) Outgoing.Enqueue("{\"type\":\"log\",\"text\":\"" + Esc(text) + "\"}");
        }

        static string Esc(string s) => (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", " ").Replace("\r", " ");

        static async Task Loop()
        {
            var buffer = new byte[16 * 1024];
            var announced = false;
            while (true)
            {
                var connected = false;
                try
                {
                    using (var ws = new ClientWebSocket())
                    {
                        using (var cts = new CancellationTokenSource(5000)) await ws.ConnectAsync(new Uri(Url), cts.Token);
                        connected = true;
                        Plugin.L.LogInfo("Connected to the BlumMods app");
                        announced = false;
                        await Send(ws, "{\"type\":\"hello\",\"game\":\"SHRED A BILLION\",\"plugin\":\"" + Plugin.Version + "\"}");
                        var receive = ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                        var sb = new StringBuilder();
                        while (ws.State == WebSocketState.Open)
                        {
                            if (receive.IsCompleted)
                            {
                                var r = await receive;
                                if (r.MessageType == WebSocketMessageType.Close) break;
                                sb.Append(Encoding.UTF8.GetString(buffer, 0, r.Count));
                                if (r.EndOfMessage)
                                {
                                    var json = sb.ToString(); sb.Clear();
                                    try
                                    {
                                        if (json.StartsWith("{\"type\":\"resetbox\"", StringComparison.Ordinal)) ResetBox.Receive(json);
                                        else if (json.StartsWith("{\"type\":\"popup\"", StringComparison.Ordinal)) Popups.Receive(json);
                                        else if (json.StartsWith("{\"type\":\"jailbox\"", StringComparison.Ordinal)) JailBox.Receive(json);
                                        else if (json.Contains("\"command\"")) Incoming.Enqueue(new Command(json));
                                    }
                                    catch (Exception e) { Plugin.L.LogWarning("Skipped a message from the app: " + e.Message); }
                                }
                                receive = ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                            }
                            while (Outgoing.TryDequeue(out var msg)) await Send(ws, msg);
                            await Task.WhenAny(receive, Task.Delay(100));
                        }
                        Plugin.L.LogInfo("The BlumMods app closed the connection (" + ws.State + "), reconnecting");
                    }
                }
                catch (Exception e)
                {
                    if (connected) Plugin.L.LogWarning("Lost the BlumMods app (" + e.GetType().Name + ": " + e.Message + "), reconnecting");
                    else if (!announced) { Plugin.L.LogInfo("BlumMods app not reachable yet (" + e.GetType().Name + "), will keep trying"); announced = true; }
                }
                await Task.Delay(3000);
            }
        }

        // A send that hangs (the app froze or went away without closing) gives up after 10 s, so the loop reconnects.
        static async Task Send(ClientWebSocket ws, string text)
        {
            var bytes = Encoding.UTF8.GetBytes(text);
            using (var cts = new CancellationTokenSource(10000))
                await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, cts.Token);
        }
    }
}
