import type { AndroidConfig, ExportedConfig } from 'expo/config-plugins'
import type { PathLike } from 'node:fs'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getConfig } from 'expo/config'
import { afterEach, describe, expect, it, vi } from 'vitest'

const googleServices = vi.hoisted(() => ({ present: undefined as boolean | undefined }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: (path: PathLike) => googleServices.present !== undefined && String(path).endsWith('google-services.json') ? googleServices.present : actual.existsSync(path),
  }
})

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const packageVersion = (JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as { version: string }).version

const mainActivityTemplate = `package com.dshtauri.dshbridge

import android.os.Bundle

import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "main"
}
`

function moddedConfig() {
  return getConfig(projectRoot, { isModdedConfig: true, skipSDKVersionRequirement: true }).exp as ExportedConfig
}

function modRequest(modName: string) {
  return { projectRoot, platformProjectRoot: resolve(projectRoot, 'android'), modName, platform: 'android' as const, introspect: true }
}

async function patchMainActivity(contents: string) {
  const config = moddedConfig()
  const mod = config.mods?.android?.mainActivity
  if (!mod)
    throw new Error('app.config.js registers no Android mainActivity mod')
  const result = await mod({ ...config, modRawConfig: config, modRequest: modRequest('mainActivity'), modResults: { path: 'MainActivity.kt', language: 'kt', contents } })
  return result.modResults.contents
}

describe('public Expo configuration packaged by expo-constants', () => {
  it('embeds the complete third-party notice without changing Android identity', () => {
    const { exp } = getConfig(projectRoot, { isPublicConfig: true, skipSDKVersionRequirement: true })
    const notice = exp.extra?.thirdPartyNotices

    expect(notice).toBe(readFileSync(resolve(projectRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8'))
    expect(String(notice)).not.toBe('')
    expect(exp.name).toBe('DSH Mobile')
    expect(exp.slug).toBe('dsh-bridge')
    expect(exp.scheme).toBe('dshbridge')
    expect(exp.version).toBe(packageVersion)
    expect(exp.android?.package).toBe('com.dshtauri.dshbridge')
    expect(Number.isInteger(exp.android?.versionCode)).toBe(true)
    expect(exp.android?.versionCode ?? 0).toBeGreaterThan(0)
  })

  it('declares the iOS store identity and only the permissions used by the app', () => {
    const { exp } = getConfig(projectRoot, { isPublicConfig: true, skipSDKVersionRequirement: true })

    expect(exp.ios?.bundleIdentifier).toBe('com.dshtauri.dshbridge')
    expect(exp.ios?.supportsTablet).toBe(true)
    expect(exp.ios?.buildNumber).toBe('1')
    expect(exp.ios?.infoPlist?.['UISupportedInterfaceOrientations~ipad']).toEqual([
      'UIInterfaceOrientationPortrait',
      'UIInterfaceOrientationPortraitUpsideDown',
      'UIInterfaceOrientationLandscapeLeft',
      'UIInterfaceOrientationLandscapeRight',
    ])
    expect(getConfig(projectRoot, { skipSDKVersionRequirement: true }).exp.ios?.config?.usesNonExemptEncryption).toBe(false)
    expect(exp.ios?.infoPlist?.NSLocalNetworkUsageDescription).toBe('DSH Mobile 使用本地网络发现并连接您电脑上的 DSH 服务。')
    expect(exp.plugins).toContainEqual(['expo-camera', {
      cameraPermission: '允许 DSH Mobile 使用相机扫描连接二维码。',
      microphonePermission: false,
      recordAudioAndroid: false,
    }])
    expect(exp.plugins).toContainEqual(['expo-secure-store', { faceIDPermission: false }])
    expect(exp.plugins).toContainEqual(['expo-notifications', {
      icon: './assets/native/notification-icon.png',
      color: '#151517',
      mode: 'production',
    }])
  })

  it('opts iOS into design compatibility so iPadOS window controls get their own top safe area', () => {
    const { exp } = getConfig(projectRoot, { isPublicConfig: true, skipSDKVersionRequirement: true })

    expect(exp.ios?.infoPlist?.UIDesignRequiresCompatibility).toBe(true)
  })

  it('shrinks release code and resources and compresses APK payloads', () => {
    const { exp } = getConfig(projectRoot, { skipSDKVersionRequirement: true })

    expect(exp.plugins).toContainEqual(['expo-build-properties', {
      android: {
        usesCleartextTraffic: true,
        buildArchs: ['arm64-v8a'],
        enableMinifyInReleaseBuilds: true,
        enableShrinkResourcesInReleaseBuilds: true,
        enableBundleCompression: true,
        useLegacyPackaging: true,
      },
    }])
  })

  it('keeps TestFlight build numbers on the EAS remote source', () => {
    const eas = JSON.parse(readFileSync(resolve(projectRoot, 'eas.json'), 'utf8')) as {
      cli?: { appVersionSource?: string }
      build?: { production?: { autoIncrement?: boolean } }
    }

    expect(eas.cli?.appVersionSource).toBe('remote')
    expect(eas.build?.production?.autoIncrement).toBe(true)
  })
})

describe('android orientation generated at prebuild', () => {
  it('replaces the portrait lock that Expo writes on MainActivity with fullUser', async () => {
    const config = moddedConfig()
    const mod = config.mods?.android?.manifest
    if (!mod)
      throw new Error('app.config.js registers no Android manifest mod')
    const manifest: AndroidConfig.Manifest.AndroidManifest = {
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        queries: [],
        application: [{
          $: { 'android:name': '.MainApplication' },
          activity: [{ $: { 'android:name': '.MainActivity', 'android:screenOrientation': 'portrait' } }],
        }],
      },
    }

    const result = await mod({ ...config, modRawConfig: config, modRequest: modRequest('manifest'), modResults: manifest })

    expect(result.modResults.manifest.application?.[0]?.activity?.[0]?.$['android:screenOrientation']).toBe('fullUser')
  })

  it('locks MainActivity to portrait below a 600dp smallest width and to fullUser otherwise', async () => {
    expect(await patchMainActivity(mainActivityTemplate)).toContain([
      '  private fun applyScreenOrientation(config: android.content.res.Configuration) {',
      '    requestedOrientation = if (config.smallestScreenWidthDp < 600) {',
      '      android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT',
      '    } else {',
      '      android.content.pm.ActivityInfo.SCREEN_ORIENTATION_FULL_USER',
      '    }',
      '  }',
    ].join('\n'))
  })

  it('applies the orientation before MainActivity calls super.onCreate', async () => {
    expect(await patchMainActivity(mainActivityTemplate)).toContain('    applyScreenOrientation(resources.configuration)\n    super.onCreate(null)\n')
  })

  it('re-applies the orientation when the configuration changes, such as a foldable unfolding', async () => {
    expect(await patchMainActivity(mainActivityTemplate)).toContain([
      'class MainActivity : ReactActivity() {',
      '',
      '  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {',
      '    super.onConfigurationChanged(newConfig)',
      '    applyScreenOrientation(newConfig)',
      '  }',
    ].join('\n'))
  })

  it('leaves an already patched MainActivity unchanged when prebuild runs again', async () => {
    const patched = await patchMainActivity(mainActivityTemplate)

    expect(await patchMainActivity(patched)).toBe(patched)
  })

  it('fails prebuild when MainActivity no longer matches the Expo template', async () => {
    const changed = mainActivityTemplate.replace('class MainActivity : ReactActivity() {', 'class MainActivity : ReactActivity(), Runnable {')

    await expect(patchMainActivity(changed)).rejects.toThrow('MainActivity.kt no longer matches the Expo template')
  })
})

describe('android FCM configuration generated from google-services.json', () => {
  afterEach(() => {
    googleServices.present = undefined
  })

  async function appConfigWith(present: boolean) {
    googleServices.present = present
    vi.resetModules()
    const { default: appConfig } = await import(/* @vite-ignore */ pathToFileURL(resolve(projectRoot, 'app.config.js')).href)
    return appConfig({ config: { name: 'DSH Mobile', slug: 'dsh-bridge', android: { package: 'com.dshtauri.dshbridge' }, extra: { eas: { projectId: 'project-id' } } } })
  }

  it('wires google-services.json into the Android build and marks FCM as configured', async () => {
    const config = await appConfigWith(true)
    expect(config.android).toEqual({ package: 'com.dshtauri.dshbridge', googleServicesFile: './google-services.json' })
    expect(config.extra).toMatchObject({ eas: { projectId: 'project-id' }, fcmConfigured: true })
  })

  it('leaves Android FCM off when the checkout has no google-services.json', async () => {
    const config = await appConfigWith(false)
    expect(config.android).toEqual({ package: 'com.dshtauri.dshbridge' })
    expect(config.extra).toMatchObject({ eas: { projectId: 'project-id' }, fcmConfigured: false })
  })

  it('embeds the FCM flag matching this checkout in the public config read by expo-constants', () => {
    const { exp } = getConfig(projectRoot, { isPublicConfig: true, skipSDKVersionRequirement: true })
    expect(exp.extra?.fcmConfigured).toBe(existsSync(resolve(projectRoot, 'google-services.json')))
  })
})
