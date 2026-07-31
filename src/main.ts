import './style.css'
import {
  Engine,
  Renderer,
  AssetManager,
  MeshRendererSystem,
  CameraSystem,
  ScriptSystem,
  Input,
  createTransform,
  createMeshRenderer,
  createCamera,
  createScript,
} from './engine/index.ts'
import * as THREE from 'three'
import type { TransformComponent } from './engine/components/Transform.ts'

// --- Canvas ---
const canvas = document.createElement('canvas')
document.body.appendChild(canvas)

// --- Subsystems ---
const renderer = new Renderer(canvas)
renderer.setBackground(0x1a1a2e)

const assets = new AssetManager()
assets.registerGeometry('cube', new THREE.BoxGeometry())
assets.registerMaterial('normal', new THREE.MeshNormalMaterial())

const input = new Input()

// --- ECS ---
const engine = new Engine()

// Demo Entity 1: Camera
const cameraEntity = engine.scene.createEntity()
cameraEntity.addComponent(createTransform({ x: 0, y: 0, z: 5 }))
cameraEntity.addComponent(createCamera())

// Demo Entity 2: Player Cube with WASD, Jump, Click, Mouse Look Script
const playerEntity = engine.scene.createEntity()
playerEntity.addComponent(createTransform())
playerEntity.addComponent(createMeshRenderer({ geometryId: 'cube', materialId: 'normal' }))
playerEntity.addComponent(
  createScript({
    onUpdate(dt, entity) {
      const transform = entity.getComponent<TransformComponent>('transform')
      if (!transform) return

      const moveSpeed = 4

      // 1. WASD Movement
      if (input.getKey('KeyW')) transform.position.z -= moveSpeed * dt
      if (input.getKey('KeyS')) transform.position.z += moveSpeed * dt
      if (input.getKey('KeyA')) transform.position.x -= moveSpeed * dt
      if (input.getKey('KeyD')) transform.position.x += moveSpeed * dt

      // 2. Space to Jump (single-frame trigger)
      if (input.getKeyDown('Space')) {
        transform.position.y += 0.5
      }

      // 3. Mouse Look using delta
      const mouseDelta = input.getMouseDelta()
      const sensitivity = 0.003
      transform.rotation.y -= mouseDelta.x * sensitivity
      transform.rotation.x -= mouseDelta.y * sensitivity
    },
  }),
)

// --- Systems ---
const scriptSystem = new ScriptSystem(engine.scene)
const meshRendererSystem = new MeshRendererSystem(engine.scene, assets, renderer)
const cameraSystem = new CameraSystem(engine.scene, renderer)

// --- Engine Frame Lifecycle Wiring ---
//
// requestAnimationFrame
//     ↓
// Engine.tick(deltaTime)
//     ↓
// Input.beginFrame()          (latches accumulators via engine.onPreUpdate)
//     ↓
// Scene.update(deltaTime)     (ECS update)
//     ↓
// ScriptSystem.update(dt)     (scripts execute & query Input API)
//     ↓
// MeshRendererSystem.sync()   (ECS -> Three.js mesh sync)
//     ↓
// CameraSystem.sync()         (ECS -> Three.js camera sync)
//     ↓
// Renderer.render()           (draw call)
//     ↓
// Input.endFrame()            (resets transient frame deltas & triggers)
//
engine.onPreUpdate = () => {
  input.beginFrame()
}

engine.onPostUpdate = (deltaTime: number) => {
  scriptSystem.update(deltaTime)
  meshRendererSystem.sync()

  const activeCamera = cameraSystem.sync()
  if (activeCamera) {
    renderer.render(activeCamera)
  }

  input.endFrame()
}

engine.start()
