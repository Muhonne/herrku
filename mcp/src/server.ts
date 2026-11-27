import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { HerrkuClient } from './client.js'
import { registerHerrkuTools } from './tools.js'

export function createHerrkuMcpServer(api: HerrkuClient): McpServer {
  const server = new McpServer({ name: 'herrku', version: '0.1.0' })
  registerHerrkuTools(server, api)
  return server
}
