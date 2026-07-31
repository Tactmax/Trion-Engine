import { Entity } from './Entity.ts'
import type { EntityMetadata } from './Entity.ts'
import type { Prefab, PrefabOverrides } from './Prefab.ts'
import { readSerializedEntities, restoreComponent, serializeEntities } from './SceneSerialization.ts'
import type { SceneData } from './SceneSerialization.ts'

export class Scene {
  private readonly entities = new Map<number, Entity>()
  private nextId = 0

  createEntity(metadata?: EntityMetadata): Entity {
    const entity = new Entity(this.nextId++, metadata)
    this.entities.set(entity.id, entity)
    return entity
  }

  instantiate(prefab: Prefab, overrides?: PrefabOverrides): Entity {
    const entity = this.createEntity()

    for (const component of prefab.createComponents(overrides)) {
      entity.addComponent(component)
    }

    return entity
  }

  serialize(): SceneData {
    return serializeEntities(this.entities.values())
  }

  deserialize(data: unknown): void {
    const entities = readSerializedEntities(data)
    this.entities.clear()
    this.nextId = 0

    for (const serialized of entities) {
      if (this.entities.has(serialized.id)) continue

      const entity = this.createEntityWithId(serialized.id, {
        name: serialized.name,
        tag: serialized.tag,
      })

      for (const [type, componentData] of Object.entries(serialized.components)) {
        const component = restoreComponent(type, componentData)
        if (component) entity.addComponent(component)
      }
    }
  }

  destroyEntity(id: number): boolean {
    return this.entities.delete(id)
  }

  getEntity(id: number): Entity | undefined {
    return this.getEntityById(id)
  }

  getEntityById(id: number): Entity | undefined {
    return this.entities.get(id)
  }

  findByName(name: string): Entity | undefined {
    for (const entity of this.entities.values()) {
      if (entity.name === name) return entity
    }

    return undefined
  }

  findByTag(tag: string): Entity[] {
    return this.findWhere((entity) => entity.tag === tag)
  }

  findFirstByComponent(type: string): Entity | undefined {
    for (const entity of this.entities.values()) {
      if (entity.hasComponent(type)) return entity
    }

    return undefined
  }

  findByComponent(type: string): Entity[] {
    return this.findWhere((entity) => entity.hasComponent(type))
  }

  findWhere(predicate: (entity: Entity) => boolean): Entity[] {
    const matches: Entity[] = []

    for (const entity of this.entities.values()) {
      if (predicate(entity)) matches.push(entity)
    }

    return matches
  }

  getAllEntities(): Entity[] {
    return [...this.entities.values()]
  }

  getEntitiesWithComponent(type: string): Entity[] {
    return this.findByComponent(type)
  }

  clear(): void {
    this.entities.clear()
  }

  private createEntityWithId(id: number, metadata?: EntityMetadata): Entity {
    const entity = new Entity(id, metadata)
    this.entities.set(id, entity)
    this.nextId = Math.max(this.nextId, id + 1)
    return entity
  }

  update(deltaTime: number): void {
    for (const entity of this.entities.values()) {
      entity.update(deltaTime)
    }
  }
}
