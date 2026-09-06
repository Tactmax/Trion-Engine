import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const TRION_ASSET_MANIFEST_ID = 'virtual:trion-asset-manifest'
const TRION_ASSET_MANIFEST_RESOLVED = `\0${TRION_ASSET_MANIFEST_ID}`

function collectAssetPaths(publicAssetsDir: string): string[] {
  if (!fs.existsSync(publicAssetsDir)) return []
  const out: string[] = []
  const walk = (dir: string, prefix: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(full, rel)
      } else if (entry.isFile()) {
        out.push(rel)
      }
    }
  }
  walk(publicAssetsDir, '')
  out.sort((a, b) => a.localeCompare(b))
  return out
}

function trionAssetManifest(): Plugin {
  const publicAssetsDir = fileURLToPath(new URL('./public/assets', import.meta.url))
  return {
    name: 'trion-asset-manifest',
    resolveId(id) {
      if (id === TRION_ASSET_MANIFEST_ID) return TRION_ASSET_MANIFEST_RESOLVED
      return null
    },
    load(id) {
      if (id !== TRION_ASSET_MANIFEST_RESOLVED) return null
      return `export const assetPaths = ${JSON.stringify(collectAssetPaths(publicAssetsDir))}\n`
    },
    configureServer(server) {
      if (!fs.existsSync(publicAssetsDir)) return
      server.watcher.add(publicAssetsDir)
      const invalidate = (file: string): void => {
        const normalized = file.split(path.sep).join('/')
        const dirNormalized = publicAssetsDir.split(path.sep).join('/')
        if (!normalized.startsWith(dirNormalized)) return
        const mod = server.moduleGraph.getModuleById(TRION_ASSET_MANIFEST_RESOLVED)
        if (!mod) return
        const reload = (server as unknown as { reloadModule?: (m: unknown) => unknown }).reloadModule
        if (typeof reload === 'function') {
          void reload.call(server, mod)
        } else {
          server.moduleGraph.invalidateModule(mod)
        }
      }
      server.watcher.on('add', invalidate)
      server.watcher.on('unlink', invalidate)
    },
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
    },
  },
  plugins: [trionAssetManifest()],
})
