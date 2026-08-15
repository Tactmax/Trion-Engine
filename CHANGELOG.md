# Changelog

All notable changes are documented here as implementation milestones.

## [0.8.2] - 2026-08-11

### Physics runtime

- Added BoxCollider and SphereCollider components.
- Added RigidBody component with velocity, gravity, drag and mass controls.
- Added PhysicsSystem and RapierPhysicsBackend for backend-agnostic simulation.

### UI runtime

- Added UI, UIButton and UIText components.
- Added UISystem bridging ECS UI components to the browser DOM with lifecycle cleanup.

### ECS and runtime foundation

- Added the Engine frame loop and Scene/Entity/Component runtime model.
- Added Transform component support.
- Added AnimationComponent and AnimationSystem for runtime GLTF animation playback.

### Rendering architecture

- Added the Three.js-backed Renderer boundary.
- Added AssetManager ownership for registered geometry, materials, textures, animation clips and animation roots.
- Added MeshRenderer and MeshRendererSystem.
- Added Camera component and CameraSystem with perspective and orthographic support.

### Gameplay runtime

- Added ScriptComponent and ScriptSystem lifecycle callbacks.
- Added keyboard, mouse, scroll, frame-scoped input states and focus-loss cleanup.

### Content and Scene features

- Added immutable Prefabs with cloned component instances and overrides.
- Added Scene queries by ID, name, tag, component and predicate.
- Added JSON-compatible Scene serialization with preserved entity IDs.
- Added GLTF/GLB loading into AssetManager with deterministic geometry/material IDs, animation clip registration and hierarchy-preserving animation roots.
- Added support for using a `SkinnedMesh` when imported geometry includes skinning data.
