import { resolve } from 'path'
import type { RspackPluginInstance } from '@rspack/core'
import { shouldLoad, toArray, transformUse } from '../utils'
import type {
  ResolvedUnpluginOptions,
  UnpluginContextMeta,
  UnpluginFactory,
  UnpluginInstance,
} from '../types'
import { createRspackContext } from './context'

const TRANSFORM_LOADER = resolve(
  __dirname,
  __DEV__ ? '../../dist/rspack/loaders/transform.js' : 'rspack/loaders/transform',
)

const LOAD_LOADER = resolve(
  __dirname,
  __DEV__ ? '../../dist/rspack/loaders/load.js' : 'rspack/loaders/load',
)

const VIRTUAL_MODULE_PREFIX = resolve(process.cwd(), '_virtual_')

export function getRspackPlugin<UserOptions = Record<string, never>>(
  factory: UnpluginFactory<UserOptions>,
): UnpluginInstance<UserOptions>['rspack'] {
  return (userOptions?: UserOptions): RspackPluginInstance => {
    return {
      apply(compiler) {
        const injected = compiler.$unpluginContext || {}
        compiler.$unpluginContext = injected

        const meta: UnpluginContextMeta = {
          framework: 'rspack',
          rspack: {
            compiler,
          },
        }
        const rawPlugins = toArray(factory(userOptions!, meta))
        for (const rawPlugin of rawPlugins) {
          const plugin = Object.assign(
            rawPlugin,
            {
              __unpluginMeta: meta,
              __virtualModulePrefix: VIRTUAL_MODULE_PREFIX,
            },
          ) as ResolvedUnpluginOptions

          // inject context object to share with loaders
          injected[plugin.name] = plugin

          compiler.hooks.thisCompilation.tap(plugin.name, (compilation) => {
            if (typeof compilation.hooks.childCompiler === 'undefined')
              throw new Error('`compilation.hooks.childCompiler` only support by @rspack/core>=0.4.1')
            compilation.hooks.childCompiler.tap(plugin.name, (childCompiler) => {
              childCompiler.$unpluginContext = injected
            })
          })

          const externalModules = new Set<string>()

          // load hook
          if (plugin.load) {
            compiler.options.module.rules.unshift({
              enforce: plugin.enforce,
              include(id) {
                return shouldLoad(id, plugin, externalModules)
              },
              use: [{
                loader: LOAD_LOADER,
                options: {
                  unpluginName: plugin.name,
                },
              }],
            })
          }

          // transform hook
          if (plugin.transform) {
            compiler.options.module.rules.unshift({
              enforce: plugin.enforce,
              use(data) {
                return transformUse(data, plugin, TRANSFORM_LOADER)
              },
            })
          }

          if (plugin.rspack)
            plugin.rspack(compiler)

          if (plugin.buildStart) {
            compiler.hooks.make.tapPromise(plugin.name, async (compilation) => {
              const context = createRspackContext(compilation)
              return plugin.buildStart!.call(context)
            })
          }

          if (plugin.buildEnd) {
            compiler.hooks.emit.tapPromise(plugin.name, async (compilation) => {
              await plugin.buildEnd!.call(createRspackContext(compilation))
            })
          }

          if (plugin.writeBundle) {
            compiler.hooks.afterEmit.tap(plugin.name, () => {
              plugin.writeBundle!()
            })
          }
        }
      },
    }
  }
}
