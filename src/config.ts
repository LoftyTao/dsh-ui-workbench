import Schema from '@deepseek-ai/schemastery'

/** Reserved for future host-side options; the current panel is configuration-free. */
export const Config = Schema.object({})
export type Config = Record<string, never>
