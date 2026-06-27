/* eslint no-console: off */
import fs from 'fs'
import path from 'path'
import * as Utils from './utils.js'

const COPY = {
  './src/manifest.json': {
    path: `${Utils.ADDON_PATH}/`,
    handler: handleManifest,
  },
  './src/_locales/dict.browser.json': {
    path: `${Utils.ADDON_PATH}/_locales/`,
    handler: handleLocales,
  },
  './src/assets/logo-native-dark.svg': `${Utils.ADDON_PATH}/assets/`,
  './src/assets/logo-native-light.svg': `${Utils.ADDON_PATH}/assets/`,
  './src/assets/logo-native.svg': `${Utils.ADDON_PATH}/assets/`,
  './LICENSE': `${Utils.ADDON_PATH}/`,
  './src/assets/logo.svg': `${Utils.ADDON_PATH}/assets/`,
  './src/assets/icon-16.png': `${Utils.ADDON_PATH}/assets/`,
  './src/assets/icon-32.png': `${Utils.ADDON_PATH}/assets/`,
  './src/assets/icon-48.png': `${Utils.ADDON_PATH}/assets/`,
  './src/assets/icon-128.png': `${Utils.ADDON_PATH}/assets/`,
  './src/assets/group-page-favicon.svg': `${Utils.ADDON_PATH}/assets/`,
  './src/assets/snapshot-native.svg': `${Utils.ADDON_PATH}/assets/`,
  './src/assets/proxy-native.svg': `${Utils.ADDON_PATH}/assets/`,
  './src/assets/window-native.svg': `${Utils.ADDON_PATH}/assets/`,
}
if (!Utils.BUNDLE_VUE) {
  COPY[`./node_modules/vue/dist/${Utils.VUE_DIST}`] = `${Utils.ADDON_PATH}/vendor/`
}

/**
 * ...
 */
async function build() {
  const entries = await parseEntries()
  await copyAllEntries(entries)
}

/**
 * ...
 */
async function copyAndWatch() {
  const entries = await parseEntries()
  await copyAllEntries(entries)

  const tasks = entries
    .filter(e => !e.srcIsDir)
    .map(e => {
      e.files = [e.src]
      return e
    })

  Utils.watch(
    tasks,
    affectedTasks => changeHandler(affectedTasks),
    (task, file) => {
      Utils.log(`Copy: File ${file} was renamed, restart this script`)
      tasks.forEach(t => t.watchers.forEach(w => w.close()))
    }
  )
}

/**
 * ...
 */
async function changeHandler(changedFiles) {
  for (const info of changedFiles) {
    Utils.log(`Copy: Changed source: ${info.src}`)
    await fs.promises.copyFile(info.src, info.dst)
  }
}

/**
 * ...
 */
async function parseEntries() {
  const entriesInfo = []
  for (const src of Object.keys(COPY)) {
    const srcStats = await fs.promises.stat(src)
    const info = { src, srcIsDir: srcStats.isDirectory() }

    const dst = COPY[src]
    let dstPath
    if (typeof dst === 'string') dstPath = dst
    else {
      dstPath = dst.path
      if (dst.handler) info.srcHandler = dst.handler
    }

    if (dstPath) {
      info.dst = path.resolve(dstPath)
      if (dstPath.endsWith('/')) {
        info.destDir = info.dst
        if (!info.srcIsDir) info.dst = path.join(info.dst, path.basename(src))
      } else {
        info.destDir = path.dirname(info.dst)
      }
    }

    entriesInfo.push(info)
  }
  return entriesInfo
}

/**
 * ...
 */
async function copyAllEntries(entries) {
  for (const info of entries) {
    await copyEntry(info)
  }
}

/**
 * ...
 */
async function copyEntry(info) {
  await fs.promises.mkdir(info.destDir, { recursive: true })

  const normSrc = path.normalize(info.src)

  if (info.srcIsDir) {
    for (const f of await Utils.treeToList(normSrc)) {
      const destDir = path.normalize(f.dir.replace(normSrc, info.dst + path.sep))

      if (f.file) {
        const srcPath = path.join(f.dir, f.file)
        const dstPath = path.join(destDir, f.file)
        if (info.srcHandler) await info.srcHandler(srcPath, dstPath)
        else await fs.promises.copyFile(srcPath, dstPath)
      } else await fs.promises.mkdir(destDir, { recursive: true })
    }
  } else {
    if (info.srcHandler) await info.srcHandler(info.src, info.dst)
    else await fs.promises.copyFile(info.src, info.dst)
  }
}

/**
 * Main
 */
function main() {
  Utils.log('Copy: Copying')

  if (Utils.IS_DEV) {
    copyAndWatch()
    Utils.logOk('Copy: Watching')
  } else {
    build()
    Utils.logOk('Copy: Done')
  }
}
main()

// Permissions Firefox supports but Chromium does not (or names differently)
const FF_ONLY_PERMS = ['contextualIdentities', 'menus', 'menus.overrideContext', 'theme', 'tabHide']
const MV3_DROP_PERMS = ['webRequestBlocking', 'proxy']
const isHostPerm = p => p === '<all_urls>' || p.includes('://') || p.startsWith('*')

async function handleManifest(srcPath, dstPath) {
  if (!process.argv.includes('--chromium')) {
    return fs.promises.copyFile(srcPath, dstPath)
  }

  const data = JSON.parse(await fs.promises.readFile(srcPath, 'utf-8'))

  data.manifest_version = 3
  data.name = 'Treebery'
  delete data.browser_specific_settings
  delete data.page_action
  delete data.omnibox

  // Background page -> service worker
  data.background = { service_worker: 'bg/background.js', type: 'module' }

  // Sidebar -> side panel
  delete data.sidebar_action
  data.side_panel = { default_path: 'sidebar/sidebar.html' }

  // browser_action -> action, with raster icons (Chromium rejects SVG here)
  const icons = { 16: 'assets/icon-16.png', 32: 'assets/icon-32.png' }
  data.action = {
    default_title: 'Treebery',
    default_icon: icons,
  }
  delete data.browser_action
  data.icons = { ...icons, 48: 'assets/icon-48.png', 128: 'assets/icon-128.png' }

  // Split host patterns into their own keys, drop unsupported permissions
  const splitPerms = (list = []) => {
    const hosts = list.filter(isHostPerm)
    const perms = list.filter(
      p => !isHostPerm(p) && !FF_ONLY_PERMS.includes(p) && !MV3_DROP_PERMS.includes(p)
    )
    return { hosts, perms }
  }
  const required = splitPerms(data.permissions)
  const optional = splitPerms(data.optional_permissions)

  data.permissions = [...required.perms, 'sidePanel', 'scripting']
  if (required.hosts.length) data.host_permissions = required.hosts
  data.optional_permissions = optional.perms
  if (optional.hosts.length) data.optional_host_permissions = optional.hosts

  // No global keyboard shortcuts on Chromium (the sidebar toggle command is gone)
  delete data.commands._execute_sidebar_action
  for (const key of Object.keys(data.commands)) {
    delete data.commands[key].suggested_key
  }

  await fs.promises.writeFile(dstPath, JSON.stringify(data, null, 2))
}

async function handleLocales(srcPath, dstPath) {
  const dirPath = path.dirname(dstPath)
  const srcData = await fs.promises.readFile(srcPath, 'utf-8')
  const jsonData = JSON.parse(srcData)

  const langs = {}

  for (const key of Object.keys(jsonData)) {
    const dict = jsonData[key]
    if (!dict || typeof dict !== 'object') {
      Utils.logErr(`Copy: Locales: No dictionary for: ${key}`)
      break
    }

    for (const lang of Object.keys(dict)) {
      if (!langs[lang]) langs[lang] = {}
      langs[lang][key] = { message: dict[lang] }
    }
  }

  for (const lang of Object.keys(langs)) {
    const dict = langs[lang]
    const jsonStr = JSON.stringify(dict)
    await fs.promises.mkdir(path.join(dirPath, lang), { recursive: true })
    await fs.promises.writeFile(path.join(dirPath, lang, 'messages.json'), jsonStr)
  }
}
