# Trion Engine Architecture

## Overview

Trion separates runtime data from rendering implementation. The ECS is the runtime model; Three.js is an implementation detail contained in the graphics boundary.

```text
Game code
    |
    v
Engine -> Scene -> Entities -> Components
                     |
                     v
              Script / graphics systems
                     |
                     v
          Renderer + AssetManager
                     |
                     v
                 Three.js -> WebGL
```

This keeps gameplay data independent from the scene graph and lets systems own their synchronization state without making Three.js objects part of component data.

## Engine lifecycle

`Engine` owns one `requestAnimationFrame` loop. Its `tick` calculates seconds since the previous frame, then invokes callbacks in this order:

```text
onPreUpdate(deltaTime)
Scene.update(deltaTime)
onPostUpdate(deltaTime)
```

The Engine does not construct or schedule systems itself. The application wires them through callbacks. The bundled demo uses `onPreUpdate` for `Input.beginFrame()`, and `onPostUpdate` for `ScriptSystem.update()`, mesh synchronization, camera synchronization, rendering and `Input.endFrame()`.

This preserves a single frame loop while allowing a host application to choose system ordering.

## ECS design and ownership

`Scene` is the sole owner of `Entity` instances in a private ID-keyed map. It creates/destroys entities, owns instantiation, querying and serialization. Entities hold a private map of components keyed by `component.type`.

Components are plain ECS data with an optional `update(deltaTime)` method. Built-in components are:

- `transform`: position, rotation and scale.
- `camera`: projection settings.
- `meshRenderer`: opaque geometry/material IDs plus shadow flags.
- `script`: lifecycle callback references and start state.

Systems query the Scene rather than owning entities. This prevents parallel ownership models and keeps ECS data central.

## Systems

`ScriptSystem` runs `onStart` once, then `onUpdate` each update for entities with a ScriptComponent. It tracks script instances to invoke `onDestroy` when a tracked script disappears. Call `ScriptSystem.clear()` when the host needs explicit cleanup for all tracked scripts.

`MeshRendererSystem` resolves `MeshRendererComponent` IDs through `AssetManager`, creates and caches a Three.js mesh per entity, synchronizes Transform and shadow flags, and removes stale meshes from `Renderer`.

`CameraSystem` selects the first camera entity returned by Scene order, creates a perspective or orthographic Three.js camera as needed, and synchronizes transform, projection and viewport aspect.

## Rendering boundary

```text
MeshRendererComponent
  geometryId + materialId
          |
          v
MeshRendererSystem
          |
          v
Renderer (private THREE.Scene, WebGLRenderer)
```

`Renderer` owns the Three.js scene graph and WebGL renderer. `MeshRendererSystem` owns its Three.js mesh cache; it borrows geometry and material references. Components intentionally do not hold Three.js objects.

## Asset ownership and disposal

`AssetManager` owns registered `THREE.BufferGeometry` and `THREE.Material` objects. Registration transfers ownership. `removeGeometry`, `removeMaterial` and `dispose` are the disposal paths; systems must not dispose borrowed resources.

The Renderer removes meshes but does not dispose their geometry or material. This distinction permits many entities to refer to the same registered asset IDs.

## Prefabs

A `Prefab` is an immutable component-template collection, not an entity and not Scene state.

```text
Prefab templates (deep-frozen copies)
        |
        v
Scene.instantiate(overrides)
        |
        v
New Entity with cloned component instances
```

Overrides are keyed by component type and recursively patch the new clone. The component `type` is protected so ECS storage identity remains stable.

## Scene queries

Scene query APIs (`findByName`, `findByTag`, `findByComponent`, `findWhere`, and related methods) scan the existing entity map. They are intentionally O(n): the API is simple today and can be backed by indexes later without changing callers.

## Scene serialization

`Scene.serialize()` returns plain JSON-compatible data containing entity IDs, optional names/tags and components keyed by type. Public component values are recursively copied; functions, symbols, bigint and undefined object fields are excluded. Consequently Script callbacks are not saved.

`Scene.deserialize(data)` clears existing entities, validates records, restores IDs and component records, and advances its next generated ID beyond the restored IDs. Serialization is scene-only; it does not save assets, projects, renderer state or prefab definitions.

## GLTF asset pipeline

```text
.gltf / .glb URL
       |
       v
graphics/GLTFLoader (Three.js GLTFLoader)
       |
       v
AssetManager.loadGLTF(id, url)
       |
       v
geometryId / materialId
       |
       v
MeshRendererComponent -> MeshRendererSystem -> Renderer
```

The GLTF adapter traverses renderable `THREE.Mesh` objects and clones geometry/material resources before transferring ownership to AssetManager. `loadGLTF('player', url)` produces pairs such as `player/mesh/0` and `player/material/0`. Reloading the same GLTF ID removes resources owned by the prior load; collisions with unrelated registered IDs fail instead of overwriting them.

The current MeshRenderer component supports one material ID. A GLTF mesh with multiple materials uses material slot zero for the complete geometry. Static meshes are supported; animation, skinning, hierarchy import and LOD are out of scope.

## Input lifecycle

`Input` listens to DOM keyboard, mouse and wheel events. Held state is available continuously. Press/release, mouse delta and scroll delta are frame-scoped:

```text
DOM events accumulate
    -> Input.beginFrame() latches deltas
    -> game/scripts read input
    -> Input.endFrame() clears transient state
```

The application must call `beginFrame` and `endFrame` in its Engine callback wiring. A window blur clears held and transient state to avoid stuck input. `dispose()` removes listeners.

## Extension points and constraints

- Add gameplay behavior as component data plus systems that operate on Scene data.
- Keep Three.js-specific code in `src/engine/graphics/`.
- Preserve ownership: Scene owns entities, AssetManager owns registered resources, Renderer owns rendering infrastructure.
- Use asset IDs in ECS rendering data rather than Three.js resource references.
- Avoid global engine singletons, duplicate entity registries and premature query indexes.
- Integrate additional frame work through Engine callbacks unless the Engine lifecycle is deliberately evolved as a separate architectural change.
