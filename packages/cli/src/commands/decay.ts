import { Command } from 'commander'
import { forgetSweep, getProjectMemoryPath, type DecayConfig } from '@supersekai64/pam-core'

export function registerDecayCommand(program: Command) {
  const decay = program.command('decay').description('Memory decay management')

  decay
    .command('sweep')
    .description('Run forget sweep (soft-delete memories below threshold)')
    .option('--lambda <lambda>', 'Temporal decay rate', '0.02')
    .option('--sigma <sigma>', 'Access reinforcement weight', '0.6')
    .option('--mu <mu>', 'Access decay rate', '0.04')
    .option('--threshold <threshold>', 'Cold threshold', '0.20')
    .option('--hard-delete-days <days>', 'Days before hard-delete', '180')
    .option('--dry-run', 'Preview without making changes')
    .action(async (options) => {
      const basePath = getProjectMemoryPath(process.cwd())

      let config: DecayConfig
      try {
        config = {
          lambda: parseMinimum(options.lambda, 'lambda', 0),
          sigma: parseMinimum(options.sigma, 'sigma', 0),
          mu: parseMinimum(options.mu, 'mu', 0),
          coldThreshold: parseRange(options.threshold, 'threshold', 0, 1),
          hardDeleteAfterDays: parseIntegerMinimum(options.hardDeleteDays, 'hard-delete-days', 0),
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }

      console.log('Running forget sweep...')
      if (options.dryRun) {
        console.log('(dry run - no changes will be made)\n')
      }

      const result = await forgetSweep(basePath, config, options.dryRun)

      console.log(`\nResults:`)
      console.log(`  Soft-deleted: ${result.softDeleted.length}`)
      console.log(`  Hard-deleted: ${result.hardDeleted.length}`)
      console.log(`  Preserved: ${result.preserved.length}`)

      if (result.softDeleted.length > 0) {
        console.log(`\nSoft-deleted memories:`)
        result.softDeleted.forEach((m) => {
          console.log(`  - ${m.metadata.id}: ${m.content.substring(0, 60)}...`)
        })
      }

      if (result.hardDeleted.length > 0) {
        console.log(`\nHard-deleted memories:`)
        result.hardDeleted.forEach((m) => {
          console.log(`  - ${m.metadata.id}: ${m.content.substring(0, 60)}...`)
        })
      }
    })
}

function parseMinimum(value: string, name: string, minimum: number): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number < minimum) {
    throw new Error(`Invalid ${name}: ${value}. Must be >= ${minimum}.`)
  }
  return number
}

function parseRange(value: string, name: string, minimum: number, maximum: number): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`Invalid ${name}: ${value}. Must be between ${minimum} and ${maximum}.`)
  }
  return number
}

function parseIntegerMinimum(value: string, name: string, minimum: number): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number < minimum) {
    throw new Error(`Invalid ${name}: ${value}. Must be an integer >= ${minimum}.`)
  }
  return number
}
