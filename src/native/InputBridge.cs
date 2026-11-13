using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;

// The desktop process selects a single installed game PID. The LAN never selects
// a process, keycode, executable, or command for this helper.
internal static class InputBridge
{
    [StructLayout(LayoutKind.Sequential)] struct Keyboard { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct Mouse { public int x, y; public uint data, flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Explicit)] struct Union { [FieldOffset(0)] public Keyboard key; [FieldOffset(0)] public Mouse mouse; }
    [StructLayout(LayoutKind.Sequential)] struct Input { public uint type; public Union data; }
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, Input[] input, int size);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mode);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    static readonly object Gate = new object();
    static readonly object OutputGate = new object();
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 8192, RecursionLimit = 12 };
    static readonly JavaScriptSerializer InputJson = new JavaScriptSerializer { MaxJsonLength = 8192, RecursionLimit = 12 };
    static readonly Dictionary<int, int> Held = new Dictionary<int, int>();
    static HashSet<int> Wanted = new HashSet<int>();
    static readonly Stopwatch Clock = Stopwatch.StartNew();
    static long validAt = -1000, lastStatus;
    static int targetPid, sent;
    static long epoch = -1;
    static Process Target;
    static bool ended, focused;
    enum SupportedGame { Unknown, IdolShowdown, HotWheels, DisneySpeedstorm, Brawlhalla }
    static SupportedGame Game;
    static bool UsesGamepads { get { return Game == SupportedGame.HotWheels || Game == SupportedGame.DisneySpeedstorm || Game == SupportedGame.Brawlhalla; } }
    static int PlayerLimit { get { return (Game == SupportedGame.DisneySpeedstorm || Game == SupportedGame.Brawlhalla) ? 4 : Game == SupportedGame.Unknown ? 0 : 2; } }
    static string GamepadProfile { get { return Game == SupportedGame.Brawlhalla ? "brawlhalla" : Game == SupportedGame.DisneySpeedstorm ? "disney-speedstorm" : Game == SupportedGame.HotWheels ? "hotwheels-unleashed" : ""; } }
    static bool GamepadOnly { get { return Game == SupportedGame.DisneySpeedstorm || Game == SupportedGame.Brawlhalla; } }
    static string ActiveControls { get { return Game == SupportedGame.Brawlhalla || Game == SupportedGame.IdolShowdown ? "fight" : "race"; } }
    static readonly HashSet<string> RacingActions = new HashSet<string> { "up", "down", "left", "right", "a", "b", "x", "y", "confirm", "back", "start", "l", "r", "lt", "rt", "select" };
    static VirtualRacingGamepad[] Gamepads;
    static string gamepadMessage;
    static bool GamepadsDisabled { get { return Environment.GetEnvironmentVariable("WATERCONSOLE_DISABLE_GAMEPAD") == "1"; } }
    const string DisabledGamepadMessage = "Phone gamepads are disabled for this PC session.";
    static readonly int[] lastMotors = { 0, 0, 0, 0 };
    static readonly long[] lastRumbleAt = { -1000, -1000, -1000, -1000 }, lastRumbleEpoch = { -1, -1, -1, -1 };
    static bool PadsActive { get { return Gamepads != null && Gamepads.Length == PlayerLimit && Gamepads.All(pad => pad != null && pad.Available && pad.Attached); } }
    static int GamepadHeld { get { return Gamepads == null ? 0 : Gamepads.Sum(pad => pad == null ? 0 : pad.Held); } }
    static object GamepadStatus { get { return UsesGamepads ? new { available = PadsActive, message = gamepadMessage } : null; } }
    static string controls = "menu", failure;

    static void Emit(object value) { lock (OutputGate) try { Console.Out.WriteLine(Json.Serialize(value)); Console.Out.Flush(); } catch { } }
    static void DisposeGamepads()
    {
        if (Gamepads != null) foreach (var pad in Gamepads) if (pad != null) pad.Dispose();
        Gamepads = null;
    }
    static string GamepadFailure(string detail)
    {
        return GamepadOnly
            ? (Game == SupportedGame.Brawlhalla ? "Brawlhalla" : "Disney Speedstorm") + " requires four independent virtual Xbox controllers. " + (detail ?? "Check the ViGEmBus driver and free XInput slots on the PC.")
            : (detail ?? "Phone gamepad connection failed.") + " P1 keyboard remains available.";
    }
    static void InitializeGamepads()
    {
        if (GamepadsDisabled) { gamepadMessage = GamepadFailure(DisabledGamepadMessage); return; }
        Gamepads = new VirtualRacingGamepad[PlayerLimit];
        var indices = new HashSet<int>();
        for (int index = 0; index < PlayerLimit; index++)
        {
            var pad = Gamepads[index] = new VirtualRacingGamepad(index + 1);
            if (!pad.Available || !pad.EnsureTarget() || !indices.Add(pad.UserIndex))
            {
                gamepadMessage = GamepadFailure(pad.Message ?? "Windows did not assign independent XInput slots.");
                DisposeGamepads();
                return;
            }
        }
        gamepadMessage = null;
    }
    static void CheckGamepads()
    {
        if (Gamepads == null || PadsActive) return;
        gamepadMessage = GamepadFailure(Gamepads.Where(pad => pad != null && !pad.Available).Select(pad => pad.Message).FirstOrDefault());
        if (GamepadOnly) failure = gamepadMessage;
        Release(); DisposeGamepads();
    }
    static void ForwardRumble(bool active)
    {
        if (!UsesGamepads || epoch < 0) return;
        long now = Clock.ElapsedMilliseconds;
        for (int index = 0; index < PlayerLimit; index++)
        {
            int motors = active && PadsActive ? Gamepads[index].ReadMotors() : 0;
            bool changedEpoch = lastRumbleEpoch[index] != epoch;
            if (motors == 0 && lastMotors[index] == 0 && !changedEpoch) continue;
            if (motors != 0 && !changedEpoch && now - lastRumbleAt[index] < 100) continue;
            lastMotors[index] = motors; lastRumbleAt[index] = now; lastRumbleEpoch[index] = epoch;
            Emit(new { type = "rumble", slot = index + 1, epoch = epoch, largeMotor = motors & 255, smallMotor = (motors >> 8) & 255 });
        }
    }
    static bool IsFocused()
    {
        IntPtr window = GetForegroundWindow();
        uint pid; GetWindowThreadProcessId(window, out pid);
        return pid == targetPid && window != IntPtr.Zero && !IsIconic(window);
    }
    static int Scan(int virtualKey)
    {
        uint mapped = MapVirtualKey((uint)virtualKey, 4);
        if (mapped == 0) throw new InvalidOperationException("A fixed game key has no scan code.");
        // Some Windows layouts omit E0 for arrows even with MAPVK_VK_TO_VSC_EX.
        // Without the explicit flag, Right becomes the second player's Numpad 6/Back.
        bool extended = (mapped & 0xff00) == 0xe000 || virtualKey >= 0x25 && virtualKey <= 0x28 || virtualKey == 0x6f;
        return (int)(mapped & 255) | (extended ? 256 : 0);
    }
    static bool Key(int scan, bool up)
    {
        Input item = new Input { type = 1 };
        item.data.key.scan = (ushort)(scan & 255);
        item.data.key.flags = 8u | (up ? 2u : 0u) | ((scan & 256) != 0 ? 1u : 0u);
        bool ok = SendInput(1, new Input[] { item }, Marshal.SizeOf(typeof(Input))) == 1;
        if (ok) sent++;
        else failure = "Windows refused input. Run the game and console at the same permission level.";
        return ok;
    }
    static void Release()
    {
        Wanted.Clear();
        validAt = -1000;
        foreach (int scan in Held.Keys.ToArray()) { if (Key(scan, true)) Held.Remove(scan); }
        if (Gamepads != null) foreach (var pad in Gamepads) if (pad != null) pad.Reset();
        ForwardRumble(false);
    }
    static void ApplyWanted()
    {
        CheckGamepads();
        foreach (int key in Held.Keys.Except(Wanted).ToArray()) if (Key(key, true)) Held.Remove(key);
        foreach (int key in Wanted.Except(Held.Keys).ToArray())
        {
            if (!IsFocused()) { Release(); break; }
            if (Key(key, false)) Held[key] = key;
        }
        if (PadsActive)
        {
            if (IsFocused()) foreach (var pad in Gamepads) pad.Apply();
            else Release();
            CheckGamepads();
        }
    }
    static Dictionary<string, int> Mapping(int slot, string mode)
    {
        if (Game == SupportedGame.HotWheels) {
            bool menu = mode == "menu";
            return new Dictionary<string, int> {
                {"up", menu ? 0x26 : 0x50}, {"down", menu ? 0x28 : 0x4c},
                {"left", menu ? 0x25 : 0x41}, {"right", menu ? 0x27 : 0x44},
                {"a", menu ? 0x0d : 0x57}, {"b", menu ? 0x1b : 0x20},
                {"x", menu ? 0x20 : 0xa0}, {"y", menu ? 0x52 : 0x52},
                {"confirm", 0x0d}, {"back", 0x1b}, {"start", menu ? 0x20 : 0x1b},
                {"l", menu ? 0xa0 : 0x51}, {"r", menu ? 0xa1 : 0x45}, {"lt", 0xa2}, {"rt", 0xa3}, {"select", 0xa2}
            };
        }
        if (Game != SupportedGame.IdolShowdown) throw new InvalidOperationException("No keyboard adapter is defined for this game.");
        bool first = slot == 1, menus = mode == "menu";
        return new Dictionary<string, int> {
            {"up", first ? 0x57 : 0x26}, {"down", first ? 0x53 : 0x28},
            {"left", first ? 0x41 : 0x25}, {"right", first ? 0x44 : 0x27},
            {"x", first ? 0x4a : 0x64}, {"y", first ? 0x4b : 0x65},
            {"b", first ? (menus ? 0x1b : 0x4c) : 0x66},
            {"a", first ? (menus ? 0x0d : 0x49) : (menus ? 0x4d : 0x68)},
            {"confirm", first ? 0x0d : 0x4d}, {"back", first ? 0x1b : 0x66},
            {"l", first ? (menus ? 0x51 : 0x59) : 0x61},
            {"r", first ? (menus ? 0x45 : 0x4f) : 0x69},
            {"lt", first ? 0x50 : 0x62}, {"rt", first ? 0x20 : 0x63},
            {"start", first ? (menus ? 0x4c : 0x0d) : 0x6d},
            {"select", first ? 0x52 : 0x6f}
        };
    }
    static bool ReadSnapshot(Dictionary<string, object> message)
    {
        CheckGamepads();
        object rawEpoch, rawMode, rawPlayers;
        if (!message.TryGetValue("epoch", out rawEpoch) || (!(rawEpoch is int) && !(rawEpoch is long)) || Convert.ToInt64(rawEpoch) < 0 || Convert.ToInt64(rawEpoch) < epoch ||
            !message.TryGetValue("controls", out rawMode) || !(rawMode is string) ||
            ((string)rawMode != "menu" && (string)rawMode != ActiveControls) ||
            !message.TryGetValue("players", out rawPlayers) || !(rawPlayers is IList)) return false;
        IList players = (IList)rawPlayers;
        if (Game == SupportedGame.Unknown || players.Count > PlayerLimit) return false;
        HashSet<int> next = new HashSet<int>(), slots = new HashSet<int>();
        var padButtons = Enumerable.Range(0, PlayerLimit).Select(index => new List<string>()).ToArray();
        foreach (object entry in players)
        {
            var player = entry as Dictionary<string, object>;
            object rawSlot, rawButtons;
            if (player == null || !player.TryGetValue("slot", out rawSlot) || !(rawSlot is int) ||
                ((int)rawSlot < 1 || (int)rawSlot > PlayerLimit) || !slots.Add((int)rawSlot) ||
                !player.TryGetValue("buttons", out rawButtons) || !(rawButtons is IList)) return false;
            IList buttons = (IList)rawButtons;
            if (buttons.Count > 16) return false;
            bool padPlayer = GamepadOnly || Game == SupportedGame.HotWheels && ((int)rawSlot == 2 || PadsActive);
            var mapping = GamepadOnly ? null : Mapping((int)rawSlot, (string)rawMode);
            foreach (object button in buttons)
            {
                int key = 0;
                if (!(button is string) || (GamepadOnly ? !RacingActions.Contains((string)button) : !mapping.TryGetValue((string)button, out key))) return false;
                if (padPlayer) padButtons[(int)rawSlot - 1].Add((string)button);
                else next.Add(Scan(key));
            }
        }
        if (Convert.ToInt64(rawEpoch) != epoch || controls != (string)rawMode) Release();
        epoch = Convert.ToInt64(rawEpoch); controls = (string)rawMode;
        if (PadsActive) for (int index = 0; index < PlayerLimit; index++) Gamepads[index].Want(padButtons[index], controls, GamepadProfile);
        Wanted = next; validAt = Clock.ElapsedMilliseconds;
        if (IsFocused()) ApplyWanted(); else Release();
        return true;
    }
    static void Tick(object unused)
    {
        lock (Gate)
        {
            if (ended) return;
            bool alive;
            try { alive = !Target.HasExited; } catch { alive = false; }
            if (!alive) { Release(); ended = true; Emit(new { type = "exited" }); return; }
            bool currentFocus = IsFocused(), changed = currentFocus != focused;
            focused = currentFocus;
            CheckGamepads();
            if (!focused || Clock.ElapsedMilliseconds - validAt > 300) Release();
            else ApplyWanted();
            ForwardRumble(focused && controls == ActiveControls && Clock.ElapsedMilliseconds - validAt <= 300);
            if (changed || failure != null || Clock.ElapsedMilliseconds - lastStatus >= 200)
            {
                lastStatus = Clock.ElapsedMilliseconds;
                Emit(new { type = "status", focused = focused, held = Held.Count, gamepadHeld = GamepadHeld, gamepad = GamepadStatus, sent = sent, error = failure });
                failure = null;
            }
        }
    }
    static bool SetGameIdentity(string file) {
        string name = System.IO.Path.GetFileName(file);
        if (string.Equals(name, "Idol Showdown.exe", StringComparison.OrdinalIgnoreCase)) Game = SupportedGame.IdolShowdown;
        else if (string.Equals(name, "hotwheels-Win64-Shipping.exe", StringComparison.OrdinalIgnoreCase)) Game = SupportedGame.HotWheels;
        else if (string.Equals(name, "Disney_Speedstorm_x64_rtl.exe", StringComparison.OrdinalIgnoreCase)) Game = SupportedGame.DisneySpeedstorm;
        else if (string.Equals(name, "Brawlhalla.exe", StringComparison.OrdinalIgnoreCase)) Game = SupportedGame.Brawlhalla;
        else Game = SupportedGame.Unknown;
        return Game != SupportedGame.Unknown;
    }
    static IEnumerable<int> KeyboardReleaseScans()
    {
        int count = Game == SupportedGame.IdolShowdown ? 2 : Game == SupportedGame.HotWheels ? 1 : 0;
        var scans = new HashSet<int>();
        for (int slot = 1; slot <= count; slot++) foreach (var key in Mapping(slot, "menu").Values.Concat(Mapping(slot, Game == SupportedGame.IdolShowdown ? "fight" : "race").Values)) scans.Add(Scan(key));
        return scans;
    }
    public static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--gamepad-status")
        {
            if (GamepadsDisabled) { Emit(new { gamepad = new { available = false, message = DisabledGamepadMessage } }); return 0; }
            using (var probe = new VirtualRacingGamepad()) Emit(new { gamepad = probe.Status });
            return 0;
        }
        if (args.Length == 2 && args[0] == "--find")
        {
            if (!SetGameIdentity(args[1])) return 2;
            foreach (var candidate in Process.GetProcessesByName(System.IO.Path.GetFileNameWithoutExtension(args[1])))
                using (candidate) try { if (string.Equals(candidate.MainModule.FileName, args[1], StringComparison.OrdinalIgnoreCase)) { Emit(new { pid = candidate.Id }); return 0; } } catch { }
            Emit(new { pid = 0 }); return 0;
        }
        if (args.Length == 2 && (args[0] == "--release-pid" || args[0] == "--close-pid"))
        {
            int pid;
            if (!int.TryParse(args[1], out pid)) return 2;
            try { using (var process = Process.GetProcessById(pid)) if (!SetGameIdentity(process.MainModule.FileName)) return 2; } catch { return 0; }
            foreach (int scan in KeyboardReleaseScans()) Key(scan,true);
            if (args[0] == "--close-pid") try {
                using (var process = Process.GetProcessById(pid)) {
                    for (int attempt = 0; attempt < 20 && !process.HasExited && process.MainWindowHandle == IntPtr.Zero; attempt++) { Thread.Sleep(100); process.Refresh(); }
                    if (!process.HasExited) process.CloseMainWindow();
                }
            } catch (ArgumentException) { }
            return 0;
        }
        if (args.Length != 2 || args[0] != "--pid" || !int.TryParse(args[1], out targetPid) || targetPid <= 0) return 2;
        try
        {
            Process target = Target = Process.GetProcessById(targetPid);
            if (!SetGameIdentity(target.MainModule.FileName))
                throw new InvalidOperationException("Only an installed supported game process is allowed.");
            if (UsesGamepads) InitializeGamepads();
            if (GamepadOnly && !PadsActive) throw new InvalidOperationException(gamepadMessage ?? GamepadFailure(null));
            Emit(new { type = "ready", pid = targetPid, inputSize = Marshal.SizeOf(typeof(Input)), gamepad = GamepadStatus, gamepadIndices = Gamepads == null ? new int[0] : Gamepads.Select(pad => pad.UserIndex).ToArray() });
            using (Timer timer = new Timer(Tick, null, 0, 15))
            {
                string line;
                while (!ended && (line = Console.ReadLine()) != null)
                {
                    if (line.Length > 8192) { lock (Gate) Release(); continue; }
                    try
                    {
                        var message = InputJson.Deserialize<Dictionary<string, object>>(line);
                        lock (Gate)
                        {
                            object rawType;
                            if (message == null || !message.TryGetValue("type", out rawType)) { Release(); validAt = -1000; continue; }
                            string type = rawType as string;
                            if (type == "input") { if (!ReadSnapshot(message)) Release(); }
                            else if (type == "reset") { Release(); validAt = -1000; }
                            else if (type == "focus")
                            {
                                Release(); target.Refresh();
                                if (!IsFocused() && target.MainWindowHandle != IntPtr.Zero) { ShowWindow(target.MainWindowHandle, 9); SetForegroundWindow(target.MainWindowHandle); }
                            }
                            else if (type == "close-game") { Release(); target.CloseMainWindow(); }
                            else if (type == "shutdown") { Release(); ended = true; }
                            else Release();
                        }
                    }
                    catch { lock (Gate) { Release(); validAt = -1000; } }
                }
                lock (Gate) { Release(); ended = true; }
            }
            DisposeGamepads();
            Emit(new { type = "stopped", held = Held.Count, gamepadHeld = GamepadHeld });
            return Held.Count == 0 ? 0 : 3;
        }
        catch (Exception error) { lock (Gate) { Release(); DisposeGamepads(); } Emit(new { type = "error", message = error.Message }); return 1; }
    }
}
