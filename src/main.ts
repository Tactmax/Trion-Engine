import './style.css'
import {
  Engine,
  Renderer,
  AssetManager,
  MeshRendererSystem,
  CameraSystem,
  ScriptSystem,
  AnimationSystem,
  Input,
  PhysicsSystem,
  createTransform,
  createMeshRenderer,
  createCamera,
  createAnimation,
  createScript,
  createUI,
  createUIText,
  createUIButton,
  UISystem,
} from './engine/index.ts'
import * as THREE from 'three'
import type { TransformComponent } from './engine/components/Transform.ts'

// --- Canvas ---
const canvas = document.createElement('canvas')
document.body.appendChild(canvas)

// --- Subsystems ---
const renderer = new Renderer(canvas)
renderer.setBackground(0x1a1a2e)

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4)
directionalLight.position.set(3, 6, 4)
renderer.add(ambientLight)
renderer.add(directionalLight)

const assets = new AssetManager()

const input = new Input()

// --- ECS ---
const engine = new Engine()

// Demo Entity 1: Camera
const cameraEntity = engine.scene.createEntity()
cameraEntity.addComponent(createTransform({ x: 0, y: 1.2, z: 2.5 }))
cameraEntity.addComponent(createCamera())

// Demo Entity 2: Rubik's Cube (loaded from GLB)
void assets.loadGLTF('rubiks-cube', '/assets/test-animation.glb').then((result) => {
  const rubiksEntity = engine.scene.createEntity()
  rubiksEntity.addComponent(createTransform({ x: 0, y: 1.2, z: 0 }))
  rubiksEntity.addComponent(createMeshRenderer({
    geometryId: result.meshes[0].geometryId,
    materialId: result.meshes[0].materialId,
  }))
  if (result.animations.length > 0) {
    rubiksEntity.addComponent(createAnimation({
      assetId: result.id,
      clips: result.animations,
      activeClip: result.animations[0],
      playing: true,
      loop: true,
    }))
  }
  rubiksEntity.addComponent(
    createScript({
      onUpdate(dt, entity) {
        const t = entity.getComponent<TransformComponent>('transform')
        if (!t) return
        if (input.getKey('KeyW')) t.position.z -= 4 * dt
        if (input.getKey('KeyS')) t.position.z += 4 * dt
        if (input.getKey('KeyA')) t.position.x -= 4 * dt
        if (input.getKey('KeyD')) t.position.x += 4 * dt
        const mouseDelta = input.getMouseDelta()
        t.rotation.y -= mouseDelta.x * 0.003
        t.rotation.x -= mouseDelta.y * 0.003
      },
    }),
  )
})

// Demo Entity 3: Minimal UI Button
const uiEntity = engine.scene.createEntity()
uiEntity.addComponent(createUI({
  position: { x: 20, y: 20 },
  size: { x: 200, y: 50 },
  backgroundColor: '#4a4a8a',
}))
uiEntity.addComponent(createUIText({
  text: 'Click Me!',
  color: 'white',
  fontSize: 18,
}))
uiEntity.addComponent(createUIButton())
uiEntity.addComponent(createScript({
  onUpdate(_dt, entity) {
    const button = entity.getComponent<any>('uiButton')
    const ui = entity.getComponent<any>('ui')
    const text = entity.getComponent<any>('uiText')
    if (button && ui && text) {
      if (button.isPressed) {
        ui.backgroundColor = '#8a4a4a'
        text.text = 'Pressed!'
      } else if (button.isHovered) {
        ui.backgroundColor = '#5a5a9a'
        text.text = 'Hovered!'
      } else {
        ui.backgroundColor = '#4a4a8a'
        text.text = 'Click Me!'
      }
    }
  }
}))

// --- Systems ---
const physicsSystem = new PhysicsSystem(engine.scene)
const scriptSystem = new ScriptSystem(engine.scene)
const meshRendererSystem = new MeshRendererSystem(engine.scene, assets, renderer)
const animationSystem = new AnimationSystem(engine.scene, assets, meshRendererSystem, renderer)
const cameraSystem = new CameraSystem(engine.scene, renderer)
const uiSystem = new UISystem(engine.scene)


// --- Engine Frame Lifecycle Wiring ---
//
// requestAnimationFrame
//     ↓
// Engine.tick(deltaTime)
//     ↓
// Input.beginFrame()          (latches accumulators via engine.onPreUpdate)
//     ↓
// SceneManager active Scene.update(deltaTime)
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
  physicsSystem.update(deltaTime)
  scriptSystem.update(deltaTime)
  animationSystem.update(deltaTime)
  meshRendererSystem.sync()
  uiSystem.update(deltaTime)

  const activeCamera = cameraSystem.sync()
  if (activeCamera) {
    renderer.render(activeCamera)
  }

  input.endFrame()
}

;(window as Window & { __trionDebug?: unknown }).__trionDebug = {
  engine,
  renderer,
  assets,
}

engine.start()
