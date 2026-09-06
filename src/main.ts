import './style.css'
import {
  Engine,
  Renderer,
  AssetManager,
  MeshRendererSystem,
  CameraSystem,
  ScriptSystem,
  AnimationSystem,
  AudioSystem,
  Input,
  PhysicsSystem,
  createTransform,
  createMeshRenderer,
  createCamera,
  createAnimation,
  createAudio,
  createScript,
  createUI,
  createUIText,
  createUIButton,
  UISystem,
} from './engine/index.ts'
import * as THREE from 'three'
import type { TransformComponent } from './engine/components/Transform.ts'
import type { AudioComponent } from './engine/components/Audio.ts'
import { Editor } from './editor/index.ts'

const canvas = document.createElement('canvas')
document.body.appendChild(canvas)

const renderer = new Renderer(canvas)
renderer.setBackground(0x1a1a2e)

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4)
directionalLight.position.set(3, 6, 4)
renderer.add(ambientLight)
renderer.add(directionalLight)

const assets = new AssetManager()

const input = new Input()

const engine = new Engine()

const cameraEntity = engine.scene.createEntity()
cameraEntity.addComponent(createTransform({ x: 0, y: 1.2, z: 2.5 }))
cameraEntity.addComponent(createCamera())

void assets.loadGLTF('rubiks-cube', '/assets/rubiks-cube.glb').then((result) => {
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

const audioEntity = engine.scene.createEntity()
void assets.loadAudio('demo-audio', '/assets/Amen%20in%20a%20nutshell.mp3').then(() => {
  audioEntity.addComponent(createAudio({
    assetId: 'demo-audio',
    playing: false,
    loop: false,
    volume: 0.5,
  }))
  audioEntity.addComponent(createScript({
    onUpdate(_dt, entity) {
      const audio = entity.getComponent<AudioComponent>('audio')
      if (!audio || audio.playing) return
      if (input.getMouseButtonDown(0) || input.getKeyDown('Space')) {
        audio.playing = false
      }
    },
  }))
})

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

const physicsSystem = new PhysicsSystem(engine.scene)
const scriptSystem = new ScriptSystem(engine.scene)
const meshRendererSystem = new MeshRendererSystem(engine.scene, assets, renderer)
const animationSystem = new AnimationSystem(engine.scene, assets, meshRendererSystem, renderer)
const audioSystem = new AudioSystem(engine.scene, assets)
const cameraSystem = new CameraSystem(engine.scene, renderer)
const uiSystem = new UISystem(engine.scene)
const editor = new Editor(engine.sceneManager, canvas, renderer, meshRendererSystem, animationSystem, assets)


engine.onPreUpdate = () => {
  input.beginFrame()
}

engine.onPostUpdate = (deltaTime: number) => {
  if (editor.isPlaying()) {
    physicsSystem.update(deltaTime)
    scriptSystem.update(deltaTime)
    audioSystem.update(deltaTime)
    uiSystem.update(deltaTime)
  }
  // Rendering sync stays active in edit mode so animated entities remain visible.
  animationSystem.update(deltaTime)
  meshRendererSystem.sync()
  editor.update()

  const activeCamera = cameraSystem.sync()
  const renderCamera = editor.isEditorViewActive() ? editor.getCamera() : activeCamera
  if (renderCamera) {
    renderer.render(renderCamera)
  }

  input.endFrame()
}

;(window as Window & { __trionDebug?: unknown }).__trionDebug = {
  engine,
  renderer,
  assets,
}

engine.start()
