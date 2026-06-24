import { Command } from 'commander'
import {
  beginHandoff,
  acceptHandoff,
  getOpenHandoff,
  listHandoffs,
  getProjectMemoryPath,
} from '@helloworlkd/pam-core'

export function registerHandoffCommand(program: Command) {
  const handoff = program.command('handoff').description('Cross-agent context transfer')

  handoff
    .command('begin')
    .description('Begin a handoff for the next agent')
    .option('-s, --summary <summary>', 'Summary of where you left off (required)')
    .option('-a, --agent <agent>', 'Agent name (e.g. claude-code, codex)')
    .option('-q, --questions <questions>', 'Open questions (comma-separated)')
    .option('-n, --next-steps <steps>', 'Next steps (comma-separated)')
    .action(async (options) => {
      if (!options.summary) {
        console.error('Error: --summary is required')
        process.exit(1)
      }

      const projectPath = getProjectMemoryPath(process.cwd())
      const basePath = projectPath

      const openQuestions = options.questions
        ? options.questions.split(',').map((s: string) => s.trim())
        : undefined
      const nextSteps = options.nextSteps
        ? options.nextSteps.split(',').map((s: string) => s.trim())
        : undefined

      const handoff = await beginHandoff(
        basePath,
        options.summary,
        options.agent,
        openQuestions,
        nextSteps,
        projectPath
      )

      console.log(`Handoff created: ${handoff.id}`)
      console.log(`\nSummary: ${handoff.summary}`)
      if (handoff.open_questions && handoff.open_questions.length > 0) {
        console.log(`\nOpen questions:`)
        handoff.open_questions.forEach((q) => console.log(`  - ${q}`))
      }
      if (handoff.next_steps && handoff.next_steps.length > 0) {
        console.log(`\nNext steps:`)
        handoff.next_steps.forEach((s) => console.log(`  - ${s}`))
      }
    })

  handoff
    .command('accept')
    .description('Accept an open handoff')
    .option('-a, --agent <agent>', 'Agent name (e.g. claude-code, codex)')
    .action(async (options) => {
      const projectPath = getProjectMemoryPath(process.cwd())
      const basePath = projectPath

      const openHandoff = await getOpenHandoff(basePath, projectPath)
      if (!openHandoff) {
        console.log('No open handoff found')
        return
      }

      const accepted = await acceptHandoff(basePath, openHandoff.id, options.agent)
      if (!accepted) {
        console.error('Failed to accept handoff')
        process.exit(1)
      }

      console.log(`Handoff accepted: ${accepted.id}`)
      console.log(`\nSummary: ${accepted.summary}`)
      if (accepted.open_questions && accepted.open_questions.length > 0) {
        console.log(`\nOpen questions:`)
        accepted.open_questions.forEach((q) => console.log(`  - ${q}`))
      }
      if (accepted.next_steps && accepted.next_steps.length > 0) {
        console.log(`\nNext steps:`)
        accepted.next_steps.forEach((s) => console.log(`  - ${s}`))
      }
    })

  handoff
    .command('list')
    .description('List all handoffs')
    .option('--status <status>', 'Filter by status (open, accepted, expired)')
    .action(async (options) => {
      const projectPath = getProjectMemoryPath(process.cwd())
      const basePath = projectPath

      const handoffs = await listHandoffs(basePath, options.status, projectPath)

      if (handoffs.length === 0) {
        console.log('No handoffs found')
        return
      }

      for (const h of handoffs) {
        console.log(`${h.id} | ${h.status} | ${h.created_at}`)
        console.log(`  Summary: ${h.summary}`)
        if (h.agent_from) console.log(`  From: ${h.agent_from}`)
        if (h.agent_to) console.log(`  To: ${h.agent_to}`)
        console.log('')
      }
    })
}
