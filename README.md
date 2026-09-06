# Trion Engine

Trion Engine is a TypeScript ECS-based browser engine built on Three.js. It provides a small runtime for composing entities, components and systems in the browser, with a clear separation between gameplay data and the Three.js rendering boundary.

## Status

Trion is under active development. The current runtime provides an ECS core, a Three.js-backed rendering boundary, input handling, prefabs, scene queries, JSON-compatible scene serialization and GLTF/GLB loading with animation support. It is not a complete game engine or editor.

Current runtime: Web

Editor: Browser-based editor (hierarchy, selection, Transform gizmos/inspection, undo/redo, play mode, WASD camera, asset browser, prefab workflow, scene save/load)

Rendering backend: Three.js / WebGL

## Features

- Engine lifecycle driven by a single `requestAnimationFrame` loop
- SceneManager ownership of the active Scene reference
- Scene, Entity and Component ECS runtime
- Transform, Camera, MeshRenderer, Script and Animation components
- Perspective and orthographic camera synchronization
- Three.js-backed mesh rendering and explicit resource ownership
- Keyboard, mouse, scroll and single-frame input states
- Immutable prefabs with component overrides
- Linear scene queries by ID, name, tag, component or predicate
- JSON-compatible scene serialization with stable entity IDs
- Asynchronous GLTF/GLB loading into `AssetManager` with geometry, material, animation clip and animation-root registration
- Texture loading and texture-backed standard material creation by asset ID
- Animation support via `AnimationComponent`, `AnimationSystem` and `AnimationMixer`
- Audio playback via `AudioComponent`, `AudioSystem` and `AssetManager.loadAudio()`
- Backend-agnostic physics architecture with an initial Rapier implementation
- DOM-backed UI subsystem with `UIComponent`, `UITextComponent`, `UIButtonComponent` and `UISystem`
- Browser editor with hierarchy, entity selection and picking, Transform gizmos (J/K/L) and inspection, undo/redo history, play mode with snapshot restore, a WASD editor camera over the existing renderer viewport, an asset browser, a prefab create/instantiate/edit workflow, and scene save/save-as/open/new with dirty tracking

## Architecture

```text
Game code
    |
    v
Engine -> SceneManager -> Scene -> Entity / Component data
                                      |
                                      v
                                   Systems (e.g. PhysicsSystem, ScriptSystem)
                                      |
                                      v
                   Renderer / AssetManager / Three.js / PhysicsBackend
```

`SceneManager` holds the active `Scene` reference. `Scene` owns entities. Systems read ECS data and synchronize Three.js objects behind the graphics boundary. `AssetManager` owns registered geometries, materials, textures, animation clips and animation roots; `MeshRendererComponent` and `AnimationComponent` refer to them by string ID.

## Runtime lifecycle

`Engine` runs the frame loop. It calls `onPreUpdate`, updates the active `Scene` through `SceneManager`, then calls `onPostUpdate`. Input and systems are wired by the application in `src/main.ts`:

```text
requestAnimationFrame
    -> Engine.tick(deltaTime)
    -> onPreUpdate(deltaTime)      // Input.beginFrame()
    -> SceneManager.getActiveScene().update(deltaTime)
    -> onPostUpdate(deltaTime)     // systems + render + Input.endFrame()
```

The demo post-update callback runs physics and script/audio/UI updates only in Play Mode, while `AnimationSystem`, `MeshRendererSystem`, editor updates, camera synchronization and `Renderer.render()` run in both modes. The editor camera renders the viewport in edit mode; the runtime camera takes over in Play Mode. See [Editor](#editor) for the editor-side behavior.

## Basic usage

```ts
import {
  Engine,
  createCamera,
  createMeshRenderer,
  createTransform,
} from './engine/index.ts'

const engine = new Engine()

// engine.scene is the active Scene held by engine.sceneManager
const camera = engine.scene.createEntity({ name: 'Main Camera' })
camera.addComponent(createTransform({ x: 0, y: 1.2, z: 4 }))
camera.addComponent(createCamera())

const cube = engine.scene.createEntity({ name: 'Cube', tag: 'Renderable' })
cube.addComponent(createTransform())
cube.addComponent(createMeshRenderer({
  geometryId: 'cube',
  materialId: 'normal',
}))
```

Geometry and materials must be registered with `AssetManager` before a `MeshRendererComponent` can render them.

## Prefabs

Prefabs are immutable component templates, not entities. Instantiation creates an independent entity and fresh component instances.

```ts
import { createPrefab, createTransform, createMeshRenderer } from './engine/index.ts'

const cubePrefab = createPrefab([
  createTransform(),
  createMeshRenderer({ geometryId: 'cube', materialId: 'normal' }),
])

const cube = engine.scene.instantiate(cubePrefab, {
  transform: { position: { x: 2, y: 0, z: 0 } },
})
```

## SceneManager

`SceneManager` is a runtime owner for the currently active `Scene`. It stores, retrieves and replaces that reference. It does not own entities or replace `Scene`.

```ts
const engine = new Engine()
const next = new Scene()

engine.sceneManager.setActiveScene(next)
engine.sceneManager.getActiveScene() // === next
engine.scene // same Scene; convenience getter

engine.sceneManager.dispose() // drops the reference; does not clear the Scene
```

Systems constructed with a `Scene` keep that instance. Replacing the active Scene does not retarget them.

## Scene queries

Scene queries perform simple O(n) scans over the Scene's entities.

```ts
const player = engine.scene.findByName('Player')
const enemies = engine.scene.findByTag('Enemy')
const camera = engine.scene.findFirstByComponent('camera')
const renderables = engine.scene.findByComponent('meshRenderer')
```

## Scene serialization

```ts
const save = engine.scene.serialize()
const json = JSON.stringify(save, null, 2)

engine.scene.deserialize(JSON.parse(json))
```

Serialization stores entity IDs, optional names/tags and JSON-compatible component data. JavaScript functions are excluded, so Script callbacks are not persisted.

## GLTF / GLB loading

`AssetManager.loadGLTF(id, url)` loads meshes, animation clips and an animation root from a GLTF or GLB asset. The returned IDs can be passed directly to `createMeshRenderer` and `createAnimation`.

```ts
const imported = await assets.loadGLTF('rubiks-cube', '/assets/rubiks-cube.glb')
const selectedClip = imported.animations[0]

const animatedEntity = engine.scene.createEntity({ name: 'Animated Mesh' })
animatedEntity.addComponent(createTransform({ x: 0, y: 0, z: -3 }))
animatedEntity.addComponent(createMeshRenderer({
  geometryId: imported.meshes[0].geometryId,
  materialId: imported.meshes[0].materialId,
}))
animatedEntity.addComponent(createAnimation({
  assetId: imported.id,
  clips: imported.animations,
  activeClip: selectedClip,
  playing: Boolean(selectedClip),
  loop: true,
}))
```

For mesh index `0`, geometry and material IDs are `rubiks-cube/mesh/0` and `rubiks-cube/material/0`. Animation clip IDs are emitted as `rubiks-cube/animation/<index>`. Multi-material meshes currently use their first material because `MeshRendererComponent` supports one material ID. The bundled demo loads `/assets/rubiks-cube.glb` this way for its Rubik's cube entity.

## Animation support

Animated entities are created with a `Transform` component plus a `MeshRenderer` and an `Animation` component. `AnimationSystem` clones the GLTF scene root into a runtime target object, creates an `AnimationMixer`, and drives the selected clip each frame. The system preserves the GLTF hierarchy and can attach a `SkinnedMesh` when the imported geometry contains skinning data.

## Textures and standard materials

```ts
await assets.loadTexture('player/albedo', '/assets/player-albedo.png')
assets.createStandardMaterial('player/material', { map: 'player/albedo' })
```

Textures are owned by `AssetManager` and are disposed through `removeTexture()` or `dispose()`. Standard materials are created from registered textures and then registered as material IDs for `MeshRendererComponent`.

## Physics

Trion Engine includes a backend-agnostic physics architecture.

The engine provides three pure ECS physics components:
- `RigidBodyComponent` (`createRigidBody`): Marks an entity as a physical body (`dynamic` or `fixed`).
- `BoxColliderComponent` (`createBoxCollider`): Attaches a box collision shape.
- `SphereColliderComponent` (`createSphereCollider`): Attaches a spherical collision shape.

The `PhysicsSystem` bridges these pure data components to an underlying `PhysicsBackend` implementation.

```ts
import { PhysicsSystem, RapierPhysicsBackend } from './engine/index.ts'

const physicsSystem = new PhysicsSystem(engine.scene)
const backend = new RapierPhysicsBackend()
await backend.initialize({ x: 0, y: -9.81, z: 0 })
physicsSystem.setBackend(backend)
```

The engine-facing API contains absolutely zero backend-specific types (e.g., no Rapier objects). All Rapier interactions are isolated entirely within `RapierPhysicsBackend.ts`. Adding another backend (like Ammo.js or Jolt) would simply involve creating a new class that implements the `PhysicsBackend` interface, with no changes needed in `PhysicsSystem` or the ECS components.

## UI

Trion includes a minimal DOM-backed UI subsystem implemented as an ECS system.

The engine provides three pure ECS UI components:
- `UIComponent` (`createUI`): Position, size, visibility and optional background color.
- `UITextComponent` (`createUIText`): Text content, color and font size.
- `UIButtonComponent` (`createUIButton`): Interaction state (`interactable`, `isHovered`, `isPressed`).

The `UISystem` bridges these pure data components to the browser DOM.

```ts
import { UISystem } from './engine/index.ts'

const uiSystem = new UISystem(engine.scene)
// Call uiSystem.update(deltaTime) in your engine.onPostUpdate
```

- UI components contain only engine-facing data — no callbacks, no DOM references.
- `UISystem` owns the DOM lifecycle: it creates a root container, manages child elements per entity, and cleans up on entity/component removal.
- `UIButtonComponent` interaction state (`isHovered`, `isPressed`) is written by `UISystem` from DOM pointer events and read by game scripts.
- UI does not depend on Three.js rendering; it overlays the canvas via a full-viewport DOM container.

## Editor

The browser editor (`src/editor/`, wired in `src/main.ts`) edits the live `Scene` through the public ECS API:

- Hierarchy panel, viewport click-to-select picking, selection highlight box, and a Transform inspector.
- Move/Rotate/Scale gizmos (`J`/`K`/`L`) driven by Three.js `TransformControls`; the `TransformComponent` stays authoritative and gizmo drags are undoable.
- Animated entities are gizmoed, picked and highlighted via their `AnimationSystem` target (`AnimationSystem.getTarget()`), which carries the world transform; the renderer mesh underneath it is never driven directly.
- Undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`, 50 entries) covers Transform edits and entity create/delete. History is editor-only and disabled in Play Mode; undo/redo push state to the viewport in the same tick.
- Play Mode (`F5` / `▶ Play`, `F8` / `⏹ Stop`) snapshots the scene, runs physics/scripts/audio/UI against the runtime camera, then restores the exact pre-play state on stop and discards runtime changes.
- Editor camera: right-drag orbits, middle-drag pans, wheel zooms, `WASD` moves while hovering the viewport, `Alt`+left-drag orbits. Camera input suspends during gizmo drags and Play Mode.
- Asset Browser (toggleable `Assets` panel) discovers `public/assets` plus stored prefabs and scenes: models instantiate into the scene via double-click or drag into the viewport; prefab and scene entries work the same way through their own flows.
- Prefab workflow: save a selected entity as a prefab from the Inspector, instantiate prefabs from the Asset Browser, and edit prefabs in an isolated session (same viewport/hierarchy/inspector/gizmo tooling) with Save/Cancel returning to the untouched scene.
- Scene File workflow (`Save Scene` menu, `Ctrl+S` / `Ctrl+Shift+S`): save, save-as, open and new scene through the existing serializer, with dirty tracking, a Save/Don't Save/Cancel prompt on unsaved switches, and history that resets per scene. Saving is disabled in Play Mode so runtime state never leaks into scene assets.

## Build and run

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

Preview the production build with `npm run preview`.

## Project structure

```text
src/
  engine/
    components/  ECS component data and factories (including ui/)
    core/        Engine, SceneManager, Scene, Entity, Prefab, serialization
    graphics/    Renderer, AssetManager, camera/mesh systems, GLTF loading
    input/       DOM input service
    physics/     Physics backend interfaces, Rapier implementation, PhysicsSystem
    systems/     Runtime systems (Script, Animation, UI)
  editor/         Browser editor UI kept separate from the runtime engine
                  (panels, asset browser, prefab/scene stores, dialogs, history)
  main.ts        Browser demo and engine wiring
```

## Design philosophy

- Keep ECS data separate from rendering implementation details.
- Make ownership explicit: SceneManager owns the active Scene reference; Scene owns entities; AssetManager owns registered GPU resources; Renderer owns the scene graph and WebGL context.
- Prefer small APIs and direct iteration over premature abstractions.
- Keep Three.js-specific code inside the graphics boundary.

## Current limitations

- No networking or WebGPU backend.
- Prefabs are single-entity snapshots with no override/reconciliation system yet.
- Prefab and scene assets persist in the browser's local storage rather than project files.
- Scene instances referencing unloaded GLTF asset IDs render only once the source model is loaded.
- Animation support is currently focused on GLTF animation clips and hierarchy-preserving runtime targets; it is not a full animation editor.
- Multi-material GLTF meshes use their first material.
- Scene serialization excludes functions and does not restore Script callbacks.
- Querying currently uses linear scans rather than indexes.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for implemented work and planned future directions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Contributors should understand the existing ownership and graphics-boundary rules before adding systems or asset features.

## License

Trion Engine is licensed under the MIT License.
See [LICENSE](LICENSE) for the full license text.
