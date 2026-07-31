# Trion Engine

Trion Engine is an early TypeScript game-engine runtime built around an Entity-Component-System (ECS) architecture. It uses Three.js as its current rendering backend and runs in browser environments through Vite.

## Status

Trion is under active development. The runtime provides an ECS core, a small Three.js rendering boundary, input handling, prefabs, scene queries and JSON-compatible scene serialization. It is not a complete game or editor.

## Features

- Engine lifecycle driven by a single `requestAnimationFrame` loop
- Scene, Entity and Component ECS runtime
- Transform, Camera, MeshRenderer and Script components
- Perspective and orthographic camera synchronization
- Three.js-backed mesh rendering and resource ownership
- Keyboard, mouse, scroll and single-frame input states
- Immutable prefabs with component overrides
- Linear scene queries by ID, name, tag, component or predicate
- JSON-compatible scene serialization with stable entity IDs
- Asynchronous GLTF/GLB static-mesh loading into `AssetManager`
- Texture loading and texture-backed standard material creation by asset ID

## Architecture

```text
Game code
    |
    v
Engine -> Scene -> Entity / Component data
                      |
                      v
                   Systems
                      |
                      v
       Renderer / AssetManager -> Three.js -> WebGL
```

`Scene` owns entities. Systems read ECS data and synchronize Three.js objects behind the graphics boundary. `AssetManager` owns registered geometries and materials; `MeshRendererComponent` refers to them by string ID.

## Runtime lifecycle

`Engine` runs the frame loop. It calls `onPreUpdate`, updates the Scene, then calls `onPostUpdate`. Input and systems are wired by the application, as shown in `src/main.ts`:

```text
requestAnimationFrame
    -> Engine.tick(deltaTime)
    -> onPreUpdate(deltaTime)      // Input.beginFrame()
    -> Scene.update(deltaTime)
    -> onPostUpdate(deltaTime)     // systems + render + Input.endFrame()
```

The demo's post-update callback runs `ScriptSystem`, `MeshRendererSystem`, `CameraSystem`, then `Renderer.render()`.

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
camera.addComponent(createTransform({ z: 5 }))
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

`AssetManager` loads static renderable meshes asynchronously. The returned IDs can be passed directly to `createMeshRenderer`.

```ts
const imported = await assets.loadGLTF('player', '/assets/player.glb')
const playerMesh = imported.meshes[0]

const player = engine.scene.createEntity({ name: 'Player' })
player.addComponent(createTransform())
player.addComponent(createMeshRenderer(playerMesh))
```

For mesh index `0`, IDs are `player/mesh/0` and `player/material/0`. Multi-material meshes currently use their first material because `MeshRendererComponent` supports one material ID.

## Textures and standard materials

```ts
await assets.loadTexture('player/albedo', '/assets/player-albedo.png')
assets.createStandardMaterial('player/material', { map: 'player/albedo' })
```

Textures are owned by `AssetManager` and are disposed through `removeTexture()` or `dispose()`. GLTF material textures remain attached to imported Three.js materials but are not yet exposed through Trion's texture-ID registry.

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
    systems/     Runtime systems
  main.ts        Browser demo and engine wiring
```

## Design philosophy

- Keep ECS data separate from rendering implementation details.
- Make ownership explicit: Scene owns entities; AssetManager owns registered GPU resources.
- Prefer small APIs and direct iteration over premature abstractions.
- Keep Three.js-specific code inside the graphics boundary.

## Current limitations

- No physics, animation playback, audio, UI, networking, editor or WebGPU backend.
- GLTF loading supports static meshes only; scene hierarchy, skins, animation and LOD are not imported.
- Multi-material GLTF meshes use their first material.
- Scene serialization excludes functions and does not restore Script callbacks.
- Querying currently uses linear scans rather than indexes.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for completed work and possible future directions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Contributors should understand the existing ownership and graphics-boundary rules before adding systems or asset features.

## License

Trion is intended to be licensed under MIT by Tactmax. A `LICENSE` file should be present in the repository before publishing.
