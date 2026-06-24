import { Command } from 'commander'

import { memoryCheckpoint } from '@helloworlkd/pam-protocol'

function collect(value: string, previous: string[] = []) {
  return [...previous, value]
}

export function registerCheckpointCommand(program: Command) {
  program
    .command('checkpoint')
    .description('Submit durable session learnings as a structured checkpoint')
    .option('--summary <summary>', 'Short summary of completed work')
    .option('--decision <decision>', 'Durable technical decision (repeatable)', collect, [])
    .option('--fact <fact>', 'Reusable project fact (repeatable)', collect, [])
    .option(
      '--preference <preference>',
      'Durable UX or workflow preference (repeatable)',
      collect,
      []
    )
    .option(
      '--mistake <mistake>',
      'Reusable lesson from a correction or bug (repeatable)',
      collect,
      []
    )
    .option('--task <task>', 'Follow-up task (repeatable)', collect, [])
    .option(
      '--concept <concept>',
      'Broad canonical concept for this checkpoint (repeatable)',
      collect,
      []
    )
    .option('--agent <agent>', 'Agent name to tag checkpoint memories')
    .option('--model <model>', 'Model name to tag checkpoint memories')
    .option('--session-id <session_id>', 'Session identifier for hook/audit records')
    .option('--json', 'Print the raw checkpoint result as JSON')
    .action(async (options) => {
      const result = await memoryCheckpoint(
        {
          summary: options.summary,
          decisions: options.decision,
          facts: options.fact,
          preferences: options.preference,
          mistakes: options.mistake,
          tasks: options.task,
          concepts: options.concept,
          agent: options.agent,
          model: options.model,
          session_id: options.sessionId,
          source: options.agent ? `cli-checkpoint:${options.agent}` : 'cli-checkpoint',
        },
        { cwd: process.cwd() }
      )

      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }

      if (result.status === 'skipped') {
        console.log(`Checkpoint skipped: ${result.reason}`)
        return
      }

      console.log(`Checkpoint recorded: ${result.created.length} ${result.status} memories`)
      for (const memory of result.created) {
        console.log(`- ${memory.metadata.id} (${memory.metadata.type})`)
      }
    })
}
