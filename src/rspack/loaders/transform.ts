import type { LoaderContext } from '@rspack/core'
import { createRspackContext } from '../context'
import type { UnpluginContext } from '../../types'

export default async function transform(
  this: LoaderContext,
  source: string,
  map: any,
) {
  const callback = this.async()

  let unpluginName: string
  if (typeof this.query === 'string') {
    const query = new URLSearchParams(this.query)
    unpluginName = query.get('unpluginName')!
  }
  else {
    unpluginName = (this.query as { unpluginName: string }).unpluginName
  }

  const id = this.resource
  const plugin = this._compiler?.$unpluginContext[unpluginName]

  if (!plugin?.transform)
    return callback(null, source, map)

  const context: UnpluginContext = {
    error: error =>
      this.emitError(typeof error === 'string' ? new Error(error) : error),
    warn: error =>
      this.emitWarning(typeof error === 'string' ? new Error(error) : error),
  }
  const res = await plugin.transform.call(
    Object.assign(
      this._compilation && createRspackContext(this._compilation),
      context,
    ),
    source,
    id,
  )

  if (res == null)
    callback(null, source, map)
  else if (typeof res !== 'string')
    callback(null, res.code, map == null ? map : (res.map || map))
  else callback(null, res, map)
}
