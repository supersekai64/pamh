#!/usr/bin/env node

import { Command } from 'commander'
import { registerInitCommand } from './commands/init.js'
import { registerAddCommand } from './commands/add.js'
import { registerListCommand } from './commands/list.js'
import { registerShowCommand } from './commands/show.js'
import { registerEditCommand } from './commands/edit.js'
import { registerDeleteCommand } from './commands/delete.js'
import { registerArchiveCommand } from './commands/archive.js'
import { registerIndexCommand } from './commands/index-cmd.js'
import { registerSearchCommand } from './commands/search.js'
import { registerDoctorCommand } from './commands/doctor.js'
import { registerRedactCommand } from './commands/redact.js'
import { registerRestoreCommand } from './commands/restore.js'
import { registerApproveCommand } from './commands/approve.js'
import { registerRejectCommand } from './commands/reject.js'
import { registerCaptureCommand } from './commands/capture.js'
import { registerCheckpointCommand } from './commands/checkpoint.js'
import { registerAuditCommand } from './commands/audit.js'
import { registerExportCommand } from './commands/export-cmd.js'
import { registerImportCommand } from './commands/import-cmd.js'
import { registerContextCommand } from './commands/context.js'
import { registerSemanticCommand } from './commands/semantic.js'
import { registerServerCommand } from './commands/server.js'
import { registerUiCommand } from './commands/ui.js'
import { registerStatusCommand } from './commands/status.js'
import { registerReviewCommand } from './commands/review.js'
import { registerSmokeTestCommand } from './commands/smoke-test.js'
import { registerHandoffCommand } from './commands/handoff.js'
import { registerDecayCommand } from './commands/decay.js'
import { registerSupersedeCommand } from './commands/supersede.js'
import { registerDebugCommand } from './commands/debug.js'
import { registerHookCommand } from './commands/hook.js'
import { registerIntelligenceCommand } from './commands/intelligence.js'
import { registerUpgradeCommand } from './commands/upgrade.js'
import { getCliVersion } from './version.js'

const program = new Command()

program.name('pam').description('Portable AI Memory CLI').version(getCliVersion())

registerInitCommand(program)
registerAddCommand(program)
registerListCommand(program)
registerShowCommand(program)
registerEditCommand(program)
registerDeleteCommand(program)
registerArchiveCommand(program)
registerIndexCommand(program)
registerSearchCommand(program)
registerDoctorCommand(program)
registerRedactCommand(program)
registerRestoreCommand(program)
registerApproveCommand(program)
registerRejectCommand(program)
registerCaptureCommand(program)
registerCheckpointCommand(program)
registerAuditCommand(program)
registerExportCommand(program)
registerImportCommand(program)
registerContextCommand(program)
registerSemanticCommand(program)
registerServerCommand(program)
registerUiCommand(program)
registerStatusCommand(program)
registerReviewCommand(program)
registerSmokeTestCommand(program)
registerHandoffCommand(program)
registerDecayCommand(program)
registerSupersedeCommand(program)
registerDebugCommand(program)
registerHookCommand(program)
registerIntelligenceCommand(program)
registerUpgradeCommand(program)

program.parse()
