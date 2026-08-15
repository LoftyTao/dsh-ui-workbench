export const PLUGIN_NAME = 'dsh-ui-workbench'
export const HOST_INJECT = ['webServer', 'sessions'] as const
export const CLIENT_INJECT = ['slots', 'sessions'] as const

export interface WorkbenchInvariantInput {
  name: string
  inject: readonly string[]
  routes: readonly string[]
}

/** Validate the stable registration contract shared by host, client, and tests. */
export function assertWorkbenchInvariant(input: WorkbenchInvariantInput): void {
  if (input.name !== PLUGIN_NAME) throw new Error(`unexpected plugin name: ${input.name}`)
  for (const service of HOST_INJECT) {
    if (!input.inject.includes(service)) throw new Error(`missing required host service: ${service}`)
  }
  if (input.routes.length === 0) throw new Error('at least one host route is required')
  if (new Set(input.routes).size !== input.routes.length) throw new Error('host route paths must be unique')
  if (input.routes.some((path) => !path.startsWith('/sidebar/api/'))) {
    throw new Error('host routes must stay under /sidebar/api/')
  }
}
