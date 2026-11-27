#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { HerrkuClient } from './client.js'
import { createHerrkuMcpServer } from './server.js'

const baseUrl = process.env.HERRKU_URL?.trim()
const token = process.env.HERRKU_TOKEN?.trim()

if (!baseUrl || !token) {
  console.error('herrku-mcp: HERRKU_URL and HERRKU_TOKEN are required')
  process.exit(1)
}

const timeoutMs = Number(process.env.HERRKU_TIMEOUT_MS ?? 30_000)
const api = new HerrkuClient({ baseUrl, token, timeoutMs })
const server = createHerrkuMcpServer(api)
const transport = new StdioServerTransport()

await server.connect(transport)
console.error(`herrku-mcp: connected to ${baseUrl}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(
      () => process.exit(0),
      () => process.exit(1),
    )
  })
}
