import { Command } from 'commander'
import {
  compileContext,
  createMemory,
  initProjectMemory,
  listMemories,
  readMemory,
} from '@helloworlkd/pam-core'

export function registerSmokeTestCommand(program: Command) {
  const smoke = program.command('smoke-test').description('Run PAM end-to-end smoke tests')

  smoke
    .command('agent')
    .description('Create and verify an active memory as an auto-capture proof')
    .action(async () => {
      const cwd = process.cwd()
      const basePath = await initProjectMemory(cwd)
      const marker = `pam-smoke-${Date.now()}`

      const memory = await createMemory(basePath, {
        type: 'knowledge',
        scope: 'project',
        status: 'active',
        source: 'smoke-test',
        tags: ['smoke-test', marker],
        salience: 0.5,
        content:
          'PAM smoke test memory: this active memory proves the local store, index, automatic capture path, and context path are reachable.',
      })

      const loaded = await readMemory(basePath, memory.metadata.id)
      const active = (await listMemories(basePath)).some(
        (item) => item.metadata.id === memory.metadata.id && item.metadata.status === 'active'
      )
      const context = await compileContext(basePath, { query: marker, maxTokens: 1200 })

      console.log('PAM agent smoke test\n')
      console.log(`Created active memory: ${memory.metadata.id}`)
      console.log(`Store: ${basePath}`)
      console.log(`Visible as active memory: ${active}`)
      console.log(`Readable from disk: ${Boolean(loaded)}`)
      console.log(`Visible in context: ${context.sources.project.length > 0 ? 'yes' : 'no'}`)
      console.log(
        `\nVerify recall with \`pam search ${marker}\` or \`pam context --query ${marker}\`.`
      )
    })
}
