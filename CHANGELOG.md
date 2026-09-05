# Changelog

All notable changes are documented here as implementation milestones.

## [1.0.2] - 2026-09-04

### Editor

- Added undo/redo history (`EditorHistory`) for Transform edits and entity create/delete, with `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` shortcuts. History is editor-only and disabled in Play Mode; undo/redo re-sync the viewport in the same tick.
- Added Play Mode (`F5` / `F8`): snapshots scene state on play, runs physics/scripts/audio/UI against the runtime camera, and restores the exact pre-play state on stop while discarding runtime changes.
- Added Move/Rotate/Scale gizmos (`J`/`K`/`L`) with hover highlighting, click-to-select picking and a selection highlight, all driven by a shared selection state.
- Animated entities are gizmoed, picked and highlighted via their `AnimationSystem` target (`AnimationSystem.getTarget()`), keeping the renderer mesh anchored underneath it.
- Added WASD editor camera movement and horizontal-drag-follows orbit direction.

### Demo scene

- The bundled demo now loads the Rubik's cube from `/assets/rubiks-cube.glb` with its animation clip and WASD/mouse script.

## [1.0.0] - 2026-09-01

### Editor foundation

- Added a browser-based editor shell with a scene hierarchy, entity selection and a Transform inspector.
- Added create and delete actions that operate through the active `Scene` API.
- Integrated the existing Three.js canvas as the editor viewport without adding a renderer or engine loop.

## [0.8.4] - 2026-09-01

### Audio runtime

- Added `AudioComponent` and `createAudio()` for engine-facing playback state.
- Added `AudioSystem` using the native Web Audio API with shared context, volume, loop, mute and lifecycle cleanup.
- Extended `AssetManager` with `loadAudio()` and audio buffer registration by asset ID.

## [0.8.3] - 2026-08-15

### ECS and runtime
- Added `SceneManager` as the runtime owner of the currently active `Scene` reference.
- `Engine` now owns a `SceneManager`; `engine.scene` is a convenience getter for the active Scene.
- `SceneManager` stores, retrieves and replaces the active Scene, and can release that reference via `dispose()`. It does not own entities or replace Scene.

## [0.8.2] - 2026-08-11

### Physics runtime

- Added BoxCollider and SphereCollider components.
- Added RigidBody component with velocity, gravity, drag and mass controls.
- Added PhysicsSystem and RapierPhysicsBackend for backend-agnostic simulation.

### UI runtime

- Added UI, UIButton and UIText components.
- Added UISystem bridging ECS UI components to the browser DOM with lifecycle cleanup.

### ECS and runtime
- Added the Engine frame loop and Scene/Entity/Component runtime model.
- Added Transform component support.
- Added immutable Prefabs with cloned component instances and per-instance overrides.
- Added Scene queries by ID, name, tag, component and predicate.
- Added JSON-compatible Scene serialization with preserved entity IDs.

### Rendering
- Added the Three.js-backed Renderer boundary.
- Added Camera component and CameraSystem with perspective and orthographic support.
- Added MeshRenderer and MeshRendererSystem with explicit resource ownership.

### Assets / GLTF
- Added AssetManager ownership for registered geometry, materials, textures, animation clips and animation roots.
- Added GLTF/GLB loading into AssetManager with deterministic geometry/material IDs, animation clip registration and hierarchy-preserving animation roots.
- Added support for using a `SkinnedMesh` when imported geometry includes skinning data.

### Animation
- Added AnimationComponent and AnimationSystem for runtime GLTF animation playback with hierarchy preservation and AnimationMixer-driven clip updates.

### Input
- Added keyboard, mouse, scroll and frame-scoped input states with focus-loss cleanup.

### Physics
- Added RigidBody, BoxCollider and SphereCollider components as pure ECS data types.
- Added PhysicsSystem with fixed-timestep accumulator and backend-agnostic PhysicsBackend interface.
- Added RapierPhysicsBackend as the initial physics implementation; all Rapier types isolated to backend.

### UI
- Added UIComponent, UITextComponent and UIButtonComponent as pure ECS data types.
- Added UISystem bridging ECS UI components to the browser DOM with lifecycle cleanup and pointer interaction state.
