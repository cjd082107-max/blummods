# BlumMods key sender. Reads commands from stdin and sends real hardware-style
# key presses (scan codes) so games that ignore normal virtual keys still see them.
#   DOWN <vk> <ext>   UP <vk> <ext>   MOUSE <flags>
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class BlumInput {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
  public static void Key(ushort vk, bool up, bool ext) {
    INPUT i = new INPUT();
    i.type = 1;
    i.u.ki.wScan = (ushort)MapVirtualKey(vk, 0);
    i.u.ki.dwFlags = 0x0008u | (up ? 0x0002u : 0u) | (ext ? 0x0001u : 0u);
    SendInput(1, new INPUT[] { i }, Marshal.SizeOf(typeof(INPUT)));
  }
  public static void Mouse(uint flags) {
    INPUT i = new INPUT();
    i.type = 0;
    i.u.mi.dwFlags = flags;
    SendInput(1, new INPUT[] { i }, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
[Console]::Out.WriteLine("READY")
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $p = $line.Split(' ')
  try {
    switch ($p[0]) {
      'DOWN'  { [BlumInput]::Key([uint16]$p[1], $false, $p[2] -eq '1') }
      'UP'    { [BlumInput]::Key([uint16]$p[1], $true,  $p[2] -eq '1') }
      'MOUSE' { [BlumInput]::Mouse([uint32]$p[1]) }
    }
  } catch { [Console]::Out.WriteLine("ERR " + $_) }
}
