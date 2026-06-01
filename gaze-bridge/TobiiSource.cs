// Real Tobii Eye Tracker 5 source.
//
// Until the Tobii Game Integration SDK is wired into the project (see
// GazeBridge.csproj), this class compiles as a stub that returns no samples.
// When you add the reference to Tobii.GameIntegration.Net.dll, swap the body
// below with calls to the actual SDK.

namespace GazeBridge;

public sealed class TobiiGazeSource : IGazeSource
{
    public string Name => "tobii";
    public bool IsConnected => false;

    public void Update() { }

    public bool TryGetNormalizedGaze(out double nx, out double ny)
    {
        nx = 0; ny = 0;
        return false;
    }

    public void Dispose() { }

    // Sketch of the real implementation once the SDK is referenced:
    //
    // using Tobii.GameIntegration.Net;
    // private readonly ITobiiGameIntegrationApi _api =
    //     TobiiGameIntegrationApi.GetApi("Favola");
    // public TobiiGazeSource() { _api.SetTrackingEnabled(true); }
    // public void Update() => _api.Update();
    // public bool IsConnected => _api.IsConnected();
    // public bool TryGetNormalizedGaze(out double nx, out double ny) {
    //     nx = 0; ny = 0;
    //     if (!_api.TryGetLatestGazePoint(out var g)) return false;
    //     nx = (g.X + 1.0) * 0.5;
    //     ny = (1.0 - g.Y) * 0.5;
    //     return true;
    // }
    // public void Dispose() => _api.Dispose();
}
