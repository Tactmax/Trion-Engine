export { Engine, Entity, Prefab, Scene, SceneManager, createPrefab, Logger, trionLogger, formatLogTime, DEFAULT_LOG_MAX_ENTRIES } from './core/index.ts'
export type { EntityMetadata, JsonValue, LogEntry, LogLevel, LogOptions, LoggerOptions, PrefabOverrides, SceneData, SerializedEntity } from './core/index.ts'
export type { Component } from './components/Component.ts'
export { createTransform } from './components/Transform.ts'
export type { TransformComponent, Vec3 } from './components/Transform.ts'
export {
  createHierarchy,
  readHierarchyParent,
  getParentId,
  getChildren,
  isDescendantOf,
  canReparent,
  applyParentLink,
  getWorldMatrix,
  getWorldTransform,
  computePreservedLocal,
  worldToLocal,
  decomposeMatrix,
} from './components/Hierarchy.ts'
export type { HierarchyComponent, ReparentCheck, TransformSnapshot } from './components/Hierarchy.ts'
export { createDirectionalLight, createPointLight, createSpotLight, createLightComponent, isLightComponentType } from './components/Light.ts'
export type {
  DirectionalLightComponent,
  LightComponent,
  LightComponentType,
  PointLightComponent,
  SpotLightComponent,
  CreateDirectionalLightOptions,
  CreatePointLightOptions,
  CreateSpotLightOptions,
} from './components/Light.ts'
export { createCamera } from './components/Camera.ts'
export type { CameraComponent, ProjectionMode, CreateCameraOptions } from './components/Camera.ts'
export { createMeshRenderer } from './components/MeshRenderer.ts'
export type { MeshRendererComponent, CreateMeshRendererOptions } from './components/MeshRenderer.ts'
export { createAnimation } from './components/Animation.ts'
export type { AnimationComponent, CreateAnimationOptions } from './components/Animation.ts'
export { createParticle, PARTICLE_DEFAULTS, PARTICLE_LIMITS, resolveParticleProps } from './components/Particle.ts'
export type {
  CreateParticleOptions,
  ParticleBurst,
  ParticleComponent,
  ParticleShape,
  ParticleSimulationSpace,
} from './components/Particle.ts'
export { createAudio } from './components/Audio.ts'
export type { AudioComponent, CreateAudioOptions } from './components/Audio.ts'
export { createScript } from './components/Script.ts'
export type { ScriptComponent, ScriptCallbacks } from './components/Script.ts'
export { createRigidBody } from './components/RigidBody.ts'
export type { RigidBodyComponent, CreateRigidBodyOptions } from './components/RigidBody.ts'
export { createBoxCollider } from './components/BoxCollider.ts'
export type { BoxColliderComponent, CreateBoxColliderOptions } from './components/BoxCollider.ts'
export { createSphereCollider } from './components/SphereCollider.ts'
export type { SphereColliderComponent, CreateSphereColliderOptions } from './components/SphereCollider.ts'
export { createUI } from './components/ui/UI.ts'
export type { UIComponent, CreateUIOptions } from './components/ui/UI.ts'
export { createUIText } from './components/ui/UIText.ts'
export type { UITextComponent, CreateUITextOptions } from './components/ui/UIText.ts'
export { createUIButton } from './components/ui/UIButton.ts'
export type { UIButtonComponent, CreateUIButtonOptions } from './components/ui/UIButton.ts'
export { Renderer, AssetManager, MeshRendererSystem, CameraSystem, LightSystem } from './graphics/index.ts'
export type { CreateStandardMaterialOptions, GLTFAssetResult, GLTFMeshAsset, MaterialDefinition, MaterialProps } from './graphics/index.ts'
export { ScriptSystem, AnimationSystem, AudioSystem, ParticleSystem, UISystem } from './systems/index.ts'
export { Input } from './input/index.ts'
export type { Vec2 } from './input/index.ts'
export { PhysicsSystem, RapierPhysicsBackend } from './physics/index.ts'
export type { PhysicsBackend, PhysicsBodyHandle, PhysicsColliderHandle, PhysVec3 } from './physics/index.ts'
