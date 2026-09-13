# Trion Engine Roadmap

This roadmap distinguishes implemented work from planned future directions. It is not a delivery schedule or a guarantee of scope.

## Implemented

- ECS runtime: Engine, SceneManager, Scene, Entity and Component foundations.
- Transform, Camera, MeshRenderer, Script, Animation, Audio and Particle components.
- Three.js-backed Renderer, MeshRendererSystem, CameraSystem, LightSystem, AnimationSystem, AudioSystem and ParticleSystem (CPU simulation, one preallocated Points per emitter).
- AssetManager ownership for geometry, materials, textures, animation clips and animation roots.
- Keyboard, mouse, scroll and frame-scoped input states.
- Immutable prefabs and generic per-instance overrides.
- Scene queries with optional entity names and tags.
- JSON-compatible scene serialization with entity ID preservation.
- GLTF/GLB loading with deterministic asset IDs, animation clip registration and hierarchy-preserving animation roots.
- RigidBody, BoxCollider and SphereCollider components.
- PhysicsSystem and RapierPhysicsBackend for backend-agnostic simulation.
- UI, UIButton and UIText components with DOM-backed UISystem.
- Browser editor: nested hierarchy with inline rename and drag-and-drop reparenting, folders, multi-selection, visibility/lock, Modify Selected menu (rename/duplicate/delete), picking, selection highlight, Transform gizmos and inspector, undo/redo history, Play Mode with snapshot restore, WASD camera, preferences and console.
- Editor duplication, material editing and directional/point/spot light editing with viewport helpers.
- Editor audio integration (Inspector section, Edit Mode preview, mp3/wav/ogg discovery) and particle editing (Inspector section, Edit Mode preview transport, emitter helpers).
- Editor Asset Browser: discovery over `public/assets` with model instantiate via double-click/drag, plus virtual prefab and scene entries.
- Editor prefab workflow: save-as-prefab, instantiate, and isolated prefab editing reusing the existing panels, gizmo and history.
- Editor scene workflow: save, save-as, open and new scene through the existing serializer, with dirty tracking, unsaved-changes prompts and per-scene history.

## In progress

- Runtime API consolidation and documentation.
- Refinement of the existing rendering and asset-loading boundary.

## Planned / TODO

Potential next steps, subject to design and prioritization:

- Prefab instance overrides/reconciliation and file-backed prefab/scene persistence.
- Networking or multiplayer-oriented runtime capabilities.
- Additional rendering backends beyond Three.js/WebGL.
- Additional physics backends such as PhysX, Bullet.js, Jolt.

## Long-term / experimental

These are exploratory areas, not commitments:

- Broader material and texture asset workflows.
- Additional GLTF/GLB import capabilities, including more complete multi-material handling where needed.
- Rendering optimizations such as instancing and profiling-guided improvements.
- Expanded platform targets and tooling.
