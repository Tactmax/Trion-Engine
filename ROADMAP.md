# Trion Engine Roadmap

This roadmap distinguishes implemented work from planned future directions. It is not a delivery schedule or a guarantee of scope.

## Implemented

- ECS runtime: Engine, Scene, Entity and Component foundations.
- Transform, Camera, MeshRenderer, Script and Animation components.
- Three.js-backed Renderer, MeshRendererSystem, CameraSystem and AnimationSystem.
- AssetManager ownership for geometry, materials, textures, animation clips and animation roots.
- Keyboard, mouse, scroll and frame-scoped input states.
- Immutable prefabs and generic per-instance overrides.
- Scene queries with optional entity names and tags.
- JSON-compatible scene serialization with entity ID preservation.
- GLTF/GLB loading with deterministic asset IDs, animation clip registration and hierarchy-preserving animation roots.

## In progress

- Runtime API consolidation and documentation.
- Refinement of the existing rendering and asset-loading boundary.

## Planned / TODO

Potential next steps, subject to design and prioritization:

- Physics integration.
- Editor tooling and scene authoring workflows.
- UI system support.
- Networking or multiplayer-oriented runtime capabilities.
- Additional rendering backends beyond Three.js/WebGL.

## Long-term / experimental

These are exploratory areas, not commitments:

- Broader material and texture asset workflows.
- Additional GLTF/GLB import capabilities, including more complete multi-material handling where needed.
- Rendering optimizations such as instancing and profiling-guided improvements.
- Expanded platform targets and tooling.
