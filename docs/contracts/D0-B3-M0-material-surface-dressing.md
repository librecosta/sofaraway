# D0-B3-M0 — ELSEWHERE Material, Surface Scale & Dressing Foundation

Baseline: `dev@1509250b08c26dc1bb094cb7e03b8d54597fb694`. Scope: VOL. I / ELSEWHERE. License: BSD-3-Clause.

M0 establishes a clean industrial palette: graphite, titanium and blue-black substrates with shallow, ordered detail. The glass openings, lighting cues and energy effects remain the visual focus. Material data is generated at runtime.

| Surface ID | Use | Nominal tile (world units) | Metalness | Base roughness |
| --- | --- | --- | ---: | ---: |
| `alloy-satin-dark` | Main shell, ceiling, corners, junction | 1.2 × 1.2 | 0.80 | 0.60 |
| `alloy-brushed-tech` | Precision braces and equipment skins | 0.8 × 1.6 | 0.85 | 0.42 |
| `panel-recessed` | Side wall plates | 1.5 × 1.5, fit whole modules across a face | 0.65 | 0.64 |
| `panel-reinforced` | Existing support ribs and future load-bearing surfaces | 1.5 × 3.0 | 0.75 | 0.55 |
| `floor-grip` | Flat floor and maintenance surfaces | 0.75 × 1.5, fit whole modules across a face | 0.55 | 0.78 |
| `utility-polymer` | Matte dielectric for equipment housings and protective edges | 0.6 × 0.6 | 0.02 | 0.82 |

- `emissive-channel-cyan`: restrained cyan luminous insert, reusable in future fixtures and optionally tinted by chapter. No additional bloom pass.
- `hologram-panel-cyan`: light transparent film with sparse analytic scan lines and a soft rim; less visual weight than playable glass. No decorative text or symbols.

Each surface has independently specified color, height and roughness. A fixed material seed, separate from the run seed, feeds periodic quintic interpolation. `H = H_struct + H_micro` represents shallow joints and material texture. Color has its own limited modulation. Wrapped central differences at texel centers divide by the physical X and Y sample intervals; the normal is `normalize(-∂H/∂x, -∂H/∂y, 1)`, encoded in RGB. The tangent-space scale is applied once. Color uses sRGB; normal and roughness are untagged data. Where sampled, roughness stores the absolute value in the green channel and uses scalar 1; other materials use the preset constant. Metalness is a constant. Height remains on the CPU; 256² tiles with mipmaps are the default. Global Three.js color management and output colors for existing volumes stay unchanged.

The geometry owns the UV transform. World mapping uses cumulative distance across the section divided by tile width and fixed F2 station divided by tile length. The regular octagon fits an integer number of Satin repeats around its circumference. Module mapping fits a whole number of lateral repeats per face and aligns longitudinal repeats to the 3-unit rings; color and data maps use the same coordinates at both sides of a Chunk join. Junction sweeps use the same physical units and base station. No texture phase derives from Chunk start, speed or Run Seed.

The volume owns its material library. Chunks and junction meshes borrow its materials and release only owned geometry or other private resources. The library reuses one generated texture set per preset and disposes materials and textures on teardown. Context restore uses the existing rebuild path. Debug has independent ownership and reuses a renderer for the object and material samples.

In `/debug/`, Surface Materials shows six lit beveled samples of the runtime surfaces and exposes their generated raw channels. Effect Materials shows two specimens that use the runtime effect definitions. Without WebGL2, clearly labeled color swatches and raw channels remain available. Canal Sky and Starfield are listed under Environment.

Changes to this material system require seam and normal checks, a GPU color-space readback, resource ownership and context restore checks, comparable CPU and GPU metrics, fixed views of the tunnel and branch, and pixel parity checks for DRIFT, DESCENT and ORBIT. The current installation and lighting rules are documented in the [architectural order contract](D0-B3-A1-F1-architectural-order-rhythmic-color.md).
