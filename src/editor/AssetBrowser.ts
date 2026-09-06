import { assetPaths } from 'virtual:trion-asset-manifest'

export type AssetKind = 'model' | 'texture' | 'data' | 'prefab' | 'scene'

export interface AssetFileInfo {
  relativePath: string
  fileName: string
  extension: string
  url: string
  kind: AssetKind
}

export interface AssetBrowserOptions {
  onSelectAsset: (asset: AssetFileInfo | null) => void
  onInstantiateAsset: (asset: AssetFileInfo) => void
  getPrefabAssets?: () => AssetFileInfo[]
  getSceneAssets?: () => AssetFileInfo[]
}

const SUPPORTED_EXTENSIONS: Record<string, AssetKind> = {
  glb: 'model',
  gltf: 'model',
  png: 'texture',
  jpg: 'texture',
  jpeg: 'texture',
  webp: 'texture',
  json: 'data',
  scene: 'scene',
}

export const ASSET_DROP_MIME = 'application/x-trion-asset'

export function discoverAssets(paths: readonly string[] = assetPaths): AssetFileInfo[] {
  const out: AssetFileInfo[] = []
  for (const relativePath of paths) {
    const normalized = relativePath.split('\\').join('/')
    const fileName = normalized.slice(normalized.lastIndexOf('/') + 1)
    const dot = fileName.lastIndexOf('.')
    if (dot <= 0) continue
    const extension = fileName.slice(dot + 1).toLowerCase()
    const kind = SUPPORTED_EXTENSIONS[extension]
    if (!kind) continue
    out.push({
      relativePath: normalized,
      fileName,
      extension,
      url: `/assets/${normalized.split('/').map(encodeURIComponent).join('/')}`,
      kind,
    })
  }
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return out
}

export function assetIdForFile(asset: AssetFileInfo): string {
  const withoutExt = asset.relativePath.replace(/\.[^.]+$/, '')
  return `asset/${withoutExt}`
}

export const PREFAB_FOLDER = 'Prefabs'

export const SCENES_FOLDER = 'Scenes'

export function prefabAssetForName(name: string): AssetFileInfo {
  return {
    relativePath: `${PREFAB_FOLDER}/${name}.prefab`,
    fileName: `${name}.prefab`,
    extension: 'prefab',
    url: '',
    kind: 'prefab',
  }
}

export function prefabNameFromAsset(asset: AssetFileInfo): string | null {
  if (asset.kind !== 'prefab') return null
  const match = /^Prefabs\/(.+)\.prefab$/.exec(asset.relativePath)
  return match ? match[1] : null
}

export function sceneAssetForName(name: string): AssetFileInfo {
  return {
    relativePath: `${SCENES_FOLDER}/${name}.scene`,
    fileName: `${name}.scene`,
    extension: 'scene',
    url: '',
    kind: 'scene',
  }
}

export function sceneNameFromAsset(asset: AssetFileInfo): string | null {
  if (asset.kind !== 'scene') return null
  const match = /^Scenes\/(.+)\.scene$/.exec(asset.relativePath)
  if (match) return match[1]
  const file = asset.relativePath.slice(asset.relativePath.lastIndexOf('/') + 1)
  return file.toLowerCase().endsWith('.scene') ? file.slice(0, -'.scene'.length) : null
}

function iconForAsset(asset: AssetFileInfo): string {
  if (asset.kind === 'model') return '◈'
  if (asset.kind === 'texture') return '▦'
  if (asset.kind === 'prefab') return '⬢'
  if (asset.kind === 'scene') return '▤'
  return '≣'
}

/** Editor-only content browser over public/assets. Assets are descriptors, never ECS entities. */
export class AssetBrowser {
  readonly element: HTMLElement
  private readonly options: AssetBrowserOptions
  private assets: AssetFileInfo[]
  private readonly breadcrumb: HTMLElement
  private readonly upButton: HTMLButtonElement
  private readonly list: HTMLUListElement
  private readonly footer: HTMLElement
  private currentPath = ''
  private selectedPath: string | null = null
  private disabled = false

  constructor(options: AssetBrowserOptions) {
    this.options = options
    this.assets = this.collectAssets()

    this.element = document.createElement('aside')
    this.element.className = 'trion-editor-panel trion-editor-asset-browser'

    const header = document.createElement('div')
    header.className = 'trion-editor-panel-header'
    const title = document.createElement('span')
    title.textContent = 'Asset Browser'
    const context = document.createElement('span')
    context.className = 'trion-editor-panel-context'
    context.textContent = 'public/assets'
    header.append(title, context)

    const nav = document.createElement('div')
    nav.className = 'trion-editor-asset-nav'
    this.upButton = document.createElement('button')
    this.upButton.type = 'button'
    this.upButton.className = 'trion-editor-button'
    this.upButton.textContent = '↑ Up'
    this.upButton.addEventListener('click', () => this.navigateUp())
    this.breadcrumb = document.createElement('div')
    this.breadcrumb.className = 'trion-editor-asset-breadcrumb'
    nav.append(this.upButton, this.breadcrumb)

    this.list = document.createElement('ul')
    this.list.className = 'trion-editor-asset-grid'

    this.footer = document.createElement('div')
    this.footer.className = 'trion-editor-asset-footer'

    this.element.append(header, nav, this.list, this.footer)
    this.render()
  }

  getSelectedAsset(): AssetFileInfo | null {
    return this.assets.find((a) => a.relativePath === this.selectedPath) ?? null
  }

  findAsset(relativePath: string): AssetFileInfo | null {
    return this.assets.find((a) => a.relativePath === relativePath) ?? null
  }

  selectByPath(relativePath: string): AssetFileInfo | null {
    const asset = this.findAsset(relativePath)
    this.selectedPath = asset ? asset.relativePath : null
    this.render()
    return asset
  }

  navigateTo(path: string): void {
    this.currentPath = path
    this.render()
  }

  refresh(): void {
    this.assets = this.collectAssets()
    if (this.selectedPath !== null && !this.assets.some((a) => a.relativePath === this.selectedPath)) {
      this.selectedPath = null
    }
    this.render()
  }

  private collectAssets(): AssetFileInfo[] {
    const merged = [
      ...discoverAssets(),
      ...(this.options.getPrefabAssets?.() ?? []),
      ...(this.options.getSceneAssets?.() ?? []),
    ]
    merged.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    return merged
  }

  clearSelection(): void {
    if (this.selectedPath === null) return
    this.selectedPath = null
    this.render()
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled
    this.render()
  }

  dispose(): void {
    this.element.remove()
  }

  private navigateUp(): void {
    if (this.currentPath === '') return
    const slash = this.currentPath.lastIndexOf('/')
    this.currentPath = slash < 0 ? '' : this.currentPath.slice(0, slash)
    this.render()
  }

  private currentFolders(): string[] {
    const prefix = this.currentPath === '' ? '' : `${this.currentPath}/`
    const folders = new Set<string>()
    for (const asset of this.assets) {
      if (!asset.relativePath.startsWith(prefix)) continue
      const rest = asset.relativePath.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash >= 0) folders.add(rest.slice(0, slash))
    }
    return [...folders].sort((a, b) => a.localeCompare(b))
  }

  private currentFiles(): AssetFileInfo[] {
    const prefix = this.currentPath === '' ? '' : `${this.currentPath}/`
    return this.assets.filter((asset) => {
      if (!asset.relativePath.startsWith(prefix)) return false
      return !asset.relativePath.slice(prefix.length).includes('/')
    })
  }

  private render(): void {
    const segments = this.currentPath === '' ? [] : this.currentPath.split('/')
    this.breadcrumb.replaceChildren()
    const rootBtn = document.createElement('button')
    rootBtn.type = 'button'
    rootBtn.className = 'trion-editor-asset-crumb'
    rootBtn.textContent = 'Assets'
    rootBtn.addEventListener('click', () => {
      this.currentPath = ''
      this.render()
    })
    this.breadcrumb.appendChild(rootBtn)
    let accumulated = ''
    for (const segment of segments) {
      const sep = document.createElement('span')
      sep.className = 'trion-editor-asset-crumb-sep'
      sep.textContent = '/'
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'trion-editor-asset-crumb'
      btn.textContent = segment
      accumulated = accumulated === '' ? segment : `${accumulated}/${segment}`
      const target = accumulated
      btn.addEventListener('click', () => {
        this.currentPath = target
        this.render()
      })
      this.breadcrumb.append(sep, btn)
    }
    this.upButton.disabled = this.currentPath === ''

    this.list.replaceChildren()
    for (const folder of this.currentFolders()) {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trion-editor-asset-item is-folder'
      const icon = document.createElement('span')
      icon.className = 'trion-editor-asset-icon'
      icon.textContent = '📁'
      const label = document.createElement('span')
      label.className = 'trion-editor-asset-label'
      label.textContent = folder
      button.append(icon, label)
      button.title = `Folder: ${this.currentPath === '' ? folder : `${this.currentPath}/${folder}`}`
      button.addEventListener('click', () => {
        this.currentPath = this.currentPath === '' ? folder : `${this.currentPath}/${folder}`
        this.render()
      })
      item.appendChild(button)
      this.list.appendChild(item)
    }
    for (const asset of this.currentFiles()) {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trion-editor-asset-item'
      if (asset.kind === 'prefab') button.classList.add('is-prefab')
      if (asset.kind === 'scene') button.classList.add('is-scene')
      button.classList.toggle('is-selected', asset.relativePath === this.selectedPath)
      const icon = document.createElement('span')
      icon.className = 'trion-editor-asset-icon'
      icon.textContent = iconForAsset(asset)
      const label = document.createElement('span')
      label.className = 'trion-editor-asset-label'
      label.textContent = asset.fileName
      button.append(icon, label)
      button.title = asset.relativePath
      if ((asset.kind === 'model' || asset.kind === 'prefab') && !this.disabled) {
        button.draggable = true
        button.addEventListener('dragstart', (e) => {
          if (!e.dataTransfer) return
          e.dataTransfer.setData(ASSET_DROP_MIME, asset.relativePath)
          e.dataTransfer.setData('text/plain', asset.relativePath)
          e.dataTransfer.effectAllowed = 'copy'
        })
      }
      button.addEventListener('click', () => {
        this.selectedPath = asset.relativePath
        this.render()
        this.options.onSelectAsset(asset)
      })
      button.addEventListener('dblclick', () => {
        if (this.disabled || (asset.kind !== 'model' && asset.kind !== 'prefab' && asset.kind !== 'scene')) return
        if (this.selectedPath !== asset.relativePath) {
          this.selectedPath = asset.relativePath
          this.render()
          this.options.onSelectAsset(asset)
        }
        this.options.onInstantiateAsset(asset)
      })
      item.appendChild(button)
      this.list.appendChild(item)
    }
    if (this.currentFolders().length === 0 && this.currentFiles().length === 0) {
      const empty = document.createElement('li')
      empty.className = 'trion-editor-asset-empty'
      empty.textContent = 'No supported assets in this folder.'
      this.list.appendChild(empty)
    }

    const selected = this.getSelectedAsset()
    this.footer.replaceChildren()
    const status = document.createElement('span')
    if (selected) {
      if ((selected.kind === 'model' || selected.kind === 'prefab') && !this.disabled) {
        status.textContent = `${selected.fileName} — double-click or drag into viewport`
      } else if (selected.kind === 'scene' && !this.disabled) {
        status.textContent = `${selected.fileName} — double-click to open`
      } else {
        status.textContent = selected.fileName
      }
    } else {
      const total = this.assets.length
      status.textContent = total === 0
        ? 'No supported assets found in public/assets.'
        : `${total} ${total === 1 ? 'asset' : 'assets'} discovered`
    }
    this.footer.appendChild(status)
  }
}
