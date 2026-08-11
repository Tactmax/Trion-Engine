# Trion Engine

Trion Engine is a TypeScript ECS-based browser engine built on Three.js. It provides a small runtime for composing entities, components and systems in the browser, with a clear separation between gameplay data and the Three.js rendering boundary.

## Status

Trion is under active development. The current runtime provides an ECS core, a Three.js-backed rendering boundary, input handling, prefabs, scene queries, JSON-compatible scene serialization and GLTF/GLB loading with animation support. It is not a complete game engine or editor.

Current runtime: Web

Editor: Planned desktop application

Rendering backend: Three.js / WebGL

## Features

- Engine lifecycle driven by a single `requestAnimationFrame` loop
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
- Backend-agnostic physics architecture with an initial Rapier implementation

## Architecture

```text
Game code
    |
    v
Engine -> Scene -> Entity / Component data
                      |
                      v
                   Systems (e.g. PhysicsSystem, ScriptSystem)
                      |
                      v
       Renderer / AssetManager / Three.js / PhysicsBackend
```

`Scene` owns entities. Systems read ECS data and synchronize Three.js objects behind the graphics boundary. `AssetManager` owns registered geometries, materials, textures, animation clips and animation roots; `MeshRendererComponent` and `AnimationComponent` refer to them by string ID.

## Runtime lifecycle

`Engine` runs the frame loop. It calls `onPreUpdate`, updates the `Scene`, then calls `onPostUpdate`. Input and systems are wired by the application in `src/main.ts`:

```text
requestAnimationFrame
    -> Engine.tick(deltaTime)
    -> onPreUpdate(deltaTime)      // Input.beginFrame()
    -> Scene.update(deltaTime)
    -> onPostUpdate(deltaTime)     // systems + render + Input.endFrame()
```

The demo post-update callback runs `ScriptSystem`, `AnimationSystem`, `MeshRendererSystem`, camera synchronization and `Renderer.render()`.

## Basic usage

```ts
import {
  Engine,
  createCamera,
  createMeshRenderer,
  createTransform,
} from './engine/index.ts'

const engine = new Engine()

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
const imported = await assets.loadGLTF('test-animation', '/assets/test-animation.glb')
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

For mesh index `0`, geometry and material IDs are `test-animation/mesh/0` and `test-animation/material/0`. Animation clip IDs are emitted as `test-animation/animation/<index>`. Multi-material meshes currently use their first material because `MeshRendererComponent` supports one material ID.

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
    components/  ECS component data and factories
    core/        Engine, Scene, Entity, Prefab, serialization
    graphics/    Renderer, AssetManager, camera/mesh systems, GLTF loading
    input/       DOM input service
    physics/     Physics backend interfaces, Rapier implementation, PhysicsSystem
    systems/     Runtime systems (Script, Animation)
  main.ts        Browser demo and engine wiring
```

## Design philosophy

- Keep ECS data separate from rendering implementation details.
- Make ownership explicit: Scene owns entities; AssetManager owns registered GPU resources; Renderer owns the scene graph and WebGL context.
- Prefer small APIs and direct iteration over premature abstractions.
- Keep Three.js-specific code inside the graphics boundary.

## Current limitations

- No audio, UI, networking, editor or WebGPU backend.
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
