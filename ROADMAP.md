# Trion Engine Roadmap

This roadmap distinguishes implemented work from possible future directions. It is not a delivery schedule or a guarantee of scope.

## Completed

- ECS runtime: Engine, Scene, Entity and Component foundations.
- Transform, Camera, MeshRenderer and Script components.
- Three.js-backed Renderer, MeshRendererSystem and CameraSystem.
- AssetManager geometry/material ownership.
- Keyboard, mouse, scroll and frame-scoped input states.
- Immutable prefabs and generic per-instance overrides.
- Scene queries with optional entity names and tags.
- JSON-compatible scene serialization with entity ID preservation.
- Static GLTF/GLB mesh loading and deterministic asset IDs.

## In progress

- Runtime API consolidation and documentation.
- Refinement of the existing rendering and asset-loading boundary.

## Planned

Potential next steps, subject to design and prioritization:

- Broader material and texture asset support.
- More complete GLTF import behavior, including multi-material handling.
- Animation and skinning support.
- Audio, physics and particle-system exploration.
- UI/runtime tooling and editor-oriented workflows.
- Query and rendering optimizations where profiling demonstrates a need.

## Long-term / experimental

These are exploratory areas, not commitments:

- Additional rendering features and backend evaluation.
- GPU instancing and other rendering optimizations.
- Expanded platform targets.
- Scene/editor tooling and project workflows.
- Networking or multiplayer-oriented runtime capabilities.
