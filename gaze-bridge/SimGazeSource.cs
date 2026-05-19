namespace GazeBridge;

public sealed class SimGazeSource : IGazeSource
{
    public string Name => "sim";
    public bool IsConnected => true;

    private readonly DateTime _t0 = DateTime.UtcNow;

    public void Update() { }

    public bool TryGetNormalizedGaze(out double nx, out double ny)
    {
        var t = (DateTime.UtcNow - _t0).TotalSeconds;
        nx = 0.5 + 0.4 * Math.Sin(2.0 * Math.PI * t / 4.0);
        ny = 0.5 + 0.4 * Math.Sin(2.0 * Math.PI * t / 3.0);
        return true;
    }

    public void Dispose() { }
}
