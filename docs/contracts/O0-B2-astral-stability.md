# ORBIT — stable projection and Astral Route Traces

ORBIT omits the shared 0.65-degree beat lens pulse. Its camera still uses the
shared 180 ms Boost envelope, speed response, steering width and player input.
The other three volumes retain their lens policies. Browser isolation at a
fixed station found the old pulse with PostFX both enabled and disabled;
removing only that term made projection and asteroid coverage constant.
Rock shapes, LOD, streaming, sky and PostFX are unchanged. The terminal sky
release now uses `volume.beats - 10`, replacing the retired 438-beat cue.

[`OrbitRouteGuides`](../../app/game/graphics/orbit-route-guides.client.ts)
owns one indexed ribbon mesh and one shared shader for five connected spans:
common approach, three BranchPath routes and common exit. Samples use actual
world stations and path tangents. The 3.27-unit downward offset puts the trace
below the gate hull and inside the existing asteroid clearance. Pixel coverage
has a small minimum width; depth testing remains enabled. No physical rails,
new route labels, gameplay paths or collision surfaces are introduced.

Main is cyan, Challenge violet and Bonus amber. Trace and RouteHologram colors
share `orbitRouteSwatches`; left/right identity always comes from branch layout.
Preselection uses `routeSide`, commitment uses `branch.side`, and unselected
routes gradually lose emphasis. Geometry stays fixed throughout the junction,
fades beyond rejoin and is disposed with the VolumeScene or a replaced run.
Subtle flow uses simulation time and the existing dynamic-light amount, with
zero motion under Reduced Motion. Context restoration rebuilds the same paths.

`Graphics.metrics()` exposes FOV, trace phase, selection, colors and visibility
alongside existing asteroid chunk/instance/LOD counts. The browser harness can
freeze a station or run continuous production rendering. Tests cover fixed
projection, unchanged landmarks, branch layouts and modes, real steering and
resource disposal. STARWAKE, charts, apertures, route rules and scores are unchanged.
