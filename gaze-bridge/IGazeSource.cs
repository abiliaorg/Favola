namespace GazeBridge;

public interface IGazeSource : IDisposable
{
    string Name { get; }
    void Update();
    bool IsConnected { get; }
    bool TryGetNormalizedGaze(out double nx, out double ny);
}
