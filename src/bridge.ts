import net from 'node:net'
import { normalizeBridgeLine } from './protocol'

export interface BridgeClientOptions {
  host: string
  port: number
  timeoutMs: number
  maxReplyBytes: number
}

export interface BridgeSendResult {
  line: string
  reply: string
  elapsedMs: number
}

export function sendBridgeLine(options: BridgeClientOptions, line: string): Promise<BridgeSendResult> {
  const command = normalizeBridgeLine(line)
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: options.host, port: options.port })
    const chunks: Buffer[] = []
    let replyBytes = 0
    let settled = false

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      socket.destroy()

      if (error) {
        reject(error)
        return
      }

      resolve({
        line: command,
        reply: Buffer.concat(chunks).toString('utf8').trim(),
        elapsedMs: Date.now() - startedAt,
      })
    }

    socket.setTimeout(options.timeoutMs)

    socket.on('connect', () => {
      socket.end(`${command}\n`, 'ascii')
    })

    socket.on('data', (chunk) => {
      replyBytes += chunk.length
      if (replyBytes > options.maxReplyBytes) {
        finish(new Error(`bridge reply exceeded ${options.maxReplyBytes} bytes`))
        return
      }
      chunks.push(chunk)
    })

    socket.on('timeout', () => {
      finish(new Error(`bridge timed out after ${options.timeoutMs} ms`))
    })

    socket.on('error', finish)
    socket.on('close', () => finish())
  })
}
