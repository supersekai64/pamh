import { Command } from 'commander'

export function registerServerCommand(program: Command) {
  const server = program.command('server').description('Run PAM servers')

  server
    .command('start')
    .description('Start the PAM MCP server over stdio')
    .action(async () => {
      const { startPamMcpServer } = await import('../mcp/server.js')
      await startPamMcpServer({ cwd: process.cwd() })
    })
}
