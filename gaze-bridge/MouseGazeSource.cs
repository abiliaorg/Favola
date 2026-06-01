using System.Runtime.InteropServices;

namespace GazeBridge;

public sealed class MouseGazeSource : IGazeSource
{
    public string Name => "mouse";
    public bool IsConnected => true;

    public void Update() { }

    public bool TryGetNormalizedGaze(out double nx, out double ny)
    {
        nx = 0; ny = 0;
        if (!GetCursorPos(out var p)) return false;
        var sw = GetSystemMetrics(SM_CXSCREEN);
        var sh = GetSystemMetrics(SM_CYSCREEN);
        if (sw <= 0 || sh <= 0) return false;
        nx = (double)p.X / sw;
        ny = (double)p.Y / sh;
        return true;
    }

    public void Dispose() { }

    private const int SM_CXSCREEN = 0;
    private const int SM_CYSCREEN = 1;

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X; public int Y; }

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);
}
