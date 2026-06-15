import { createConnection } from 'node:net'
import { get, request as httpRequest } from 'node:http'
import { execFile, spawn } from 'node:child_process'
import { Command } from 'commander'

interface UiCommandOptions {
  host?: string
  port?: string
  open?: boolean
}

export function registerUiCommand(program: Command) {
  program
    .command('ui')
    .description('Start the local PAMH web UI')
    .option('--host <host>', 'Host to bind', '127.0.0.1')
    .option('-p, --port <port>', 'Port to bind', '3939')
    .option('--open', 'Open the UI in the default browser')
    .action(async (options: UiCommandOptions) => {
      const port = Number.parseInt(options.port ?? '3939', 10)
      if (!Number.isFinite(port)) {
        console.error(`Invalid port: ${options.port}`)
        process.exit(1)
      }

      const host = options.host ?? '127.0.0.1'
      const url = `http://${host}:${port}`

      try {
        const app = await startUiServer(host, port)

        console.log(`PAMH UI running at ${app.url}`)
        console.log('Press Ctrl+C to stop.')

        if (options.open) {
          openBrowser(app.url)
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          const running = await probeServer(url)
          if (running) {
            console.log(`Stopping existing PAMH UI instance on port ${port}...`)
            await shutdownServer(url)
            const freed = await waitForPortFree(host, port, 3000)
            if (!freed) {
              await killProcessOnPort(port)
              await waitForPortFree(host, port, 4000)
            }

            const app = await startUiServer(host, port)
            console.log(`PAMH UI running at ${app.url}`)
            console.log('Press Ctrl+C to stop.')
            if (options.open) openBrowser(app.url)
            return
          }
          console.error(
            `Port ${port} is already in use by another process. Use --port to specify a different port.`
          )
          process.exit(1)
        }
        if (isPamhPackageMismatch(error)) {
          console.error(
            'PAMH UI cannot start because the installed pamh-cli, pamh-api, and pamh-core packages are incompatible.'
          )
          console.error(
            'Update all published PAMH packages together, or use a workspace-linked CLI build.'
          )
          console.error(error instanceof Error ? error.message : String(error))
          process.exit(1)
        }
        throw error
      }
    })
}

async function startUiServer(host: string, port: number) {
  const { startLocalApiServer } = await import('pamh-api')
  return startLocalApiServer({
    cwd: process.cwd(),
    host,
    port,
  })
}

function isPamhPackageMismatch(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    /requested module 'pamh-core' does not provide an export named/i.test(error.message)
  )
}

function probeServer(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = get(url, (res) => {
      res.resume()
      resolve(res.statusCode !== undefined)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

function shutdownServer(url: string): Promise<void> {
  return new Promise((resolve) => {
    const parsed = new URL(`${url}/api/shutdown`)
    const req = httpRequest(
      { host: parsed.hostname, port: parsed.port, path: parsed.pathname, method: 'POST' },
      (res) => {
        res.resume()
        resolve()
      }
    )
    req.on('error', () => resolve())
    req.setTimeout(3000, () => {
      req.destroy()
      resolve()
    })
    req.end()
  })
}

function waitForPortFree(host: string, port: number, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const check = () => {
      const sock = createConnection({ host, port })
      sock.once('connect', () => {
        sock.destroy()
        if (Date.now() < deadline) setTimeout(check, 200)
        else resolve(false)
      })
      sock.once('error', () => {
        sock.destroy()
        resolve(true)
      })
    }
    setTimeout(check, 300)
  })
}

function killProcessOnPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `$p = (Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess; if ($p) { Stop-Process -Id $p -Force }`,
        ],
        () => resolve()
      )
    } else {
      execFile('sh', ['-c', `lsof -ti tcp:${port} | xargs kill -9 2>/dev/null || true`], () =>
        resolve()
      )
    }
  })
}

function openBrowser(url: string): void {
  const command =
    process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.unref()
}
