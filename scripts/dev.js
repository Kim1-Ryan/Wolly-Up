import { spawn } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

process.chdir(fileURLToPath(new URL('../', import.meta.url)))
const api = spawn(process.execPath, ['--watch', 'server/index.js'], { stdio: 'inherit' })
let vite
let stopping = false

async function stop(code = 0) {
  if (stopping) return
  stopping = true
  api.kill()
  await vite?.close()
  process.exitCode = code
}

api.on('error', (error) => {
  console.error('Unable to start the API:', error.message)
  void stop(1)
})
api.on('exit', (code) => {
  if (!stopping) {
    console.error('The API stopped. Check the error above and your DATABASE_URL.')
    void stop(code || 1)
  }
})
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())

try {
  vite = await createServer()
  if (stopping) {
    await vite.close()
  } else {
    await vite.listen()
    vite.printUrls()
  }
} catch (error) {
  console.error(error)
  await stop(1)
}
