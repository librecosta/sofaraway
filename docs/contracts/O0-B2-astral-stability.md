# ORBIT — stable projection and branch entry beacons

ORBIT omits the shared 0.65-degree beat lens pulse. Its camera still uses the
shared 180 ms Boost envelope, speed response, steering width and player input.
The other three volumes retain their lens policies. Browser isolation at a
fixed station found the old pulse with PostFX both enabled and disabled;
removing only that term made projection and asteroid coverage constant.
Rock shapes, LOD, streaming, sky and PostFX are unchanged. The terminal sky
release now uses `volume.beats - 10`, replacing the retired 438-beat cue.

The original B2 route ribbons were replaced in C2-F1 by
[`OrbitEntryBeacons`](../../app/game/graphics/orbit-entry-beacons.client.ts).
Three small, depth-tested soft patches share one quad at the actual Split frame.
Their input-space centers lie inside the three `selectSide()` bands, within the
base steering range; `playerViewOffset()` maps them into visible world space.
They do not sample the expanded side paths or add any collision requirement.

Main is cyan, Challenge violet and Bonus amber, from `orbitRouteSwatches` and the
seeded layout. Tiny names sit next to the patches; ORBIT no longer creates the
large RouteHologram or any approach/branch/merge ribbons. Other volumes retain
their existing holograms. Beacons fade in before Preview and out over seven world
units after Split. Preselection uses `routeSide`, commitment uses `branch.side`.
No flow, music pulse or independent clock is used. Context restoration rebuilds
the same fixed selection plane. Geometry and materials are VolumeScene-owned.
The patch shader retains a small minimum pixel footprint on approach. Browser
isolation hides only the beacon materials to check each patch's actual GPU
contribution independently of route-gate previews. The fixed-step Preview-to-Split
window measures 5.62 s in Normal cruise and 3.87 s with Impossible held Boost.

`Graphics.metrics()` exposes FOV, beacon phase, selection, colors and visibility
alongside existing asteroid chunk/instance/LOD counts. The browser harness can
freeze a station or run continuous production rendering. Tests cover fixed
projection, unchanged landmarks, branch layouts and modes, real steering and
resource disposal. STARWAKE, charts, apertures, route rules and scores are unchanged.
