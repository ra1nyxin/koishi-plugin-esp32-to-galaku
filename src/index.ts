import { Context, Schema } from 'koishi'
import { sendBridgeLine } from './bridge'
import { buildSerialCommand, selectProtocolReply } from './protocol'

export const name = 'esp32-to-galaku'

export interface Config {
  host: string
  port: number
  timeoutMs: number
  maxReplyBytes: number
  allowRaw: boolean
  messageHitDefault: boolean
  messageHitDamage: number
}

export const Config: Schema<Config> = Schema.object({
  host: Schema.string().default('127.0.0.1').description('PowerShell TCP 串口桥监听地址。'),
  port: Schema.number().min(1).max(65535).default(25363).description('PowerShell TCP 串口桥监听端口。'),
  timeoutMs: Schema.number().min(500).max(30000).default(3500).description('等待桥脚本回复的超时时间，单位毫秒。'),
  maxReplyBytes: Schema.number().min(256).max(65536).default(4096).description('单次命令最多读取的桥脚本回复字节数。'),
  allowRaw: Schema.boolean().default(false).description('允许 galaku raw <command> 发送原始串口命令。'),
  messageHitDefault: Schema.boolean().default(false).description('启动时是否启用新消息自动 HIT。'),
  messageHitDamage: Schema.number().min(0.1).max(100).default(10).description('messagehit 启用后每条新消息触发的 HIT damage。'),
})

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger(name)
  let messageHitEnabled = config.messageHitDefault
  let messageHitQueue = Promise.resolve()

  ctx.middleware(async (session, next) => {
    if (messageHitEnabled && session.userId !== session.selfId && !isGalakuCommandMessage(session.content)) {
      messageHitQueue = messageHitQueue
        .then(() => sendBridgeLine(config, `HIT ${config.messageHitDamage}`))
        .then((result) => {
          const reply = selectProtocolReply(result.reply, result.line)
          if (reply) logger.debug(`messagehit: ${reply}`)
        })
        .catch((error) => logger.warn(`messagehit failed: ${error instanceof Error ? error.message : error}`))
    }

    return next()
  })

  ctx.command('galaku <operation:string> [value:text]', 'ESP32-S3 GALAKU 控制桥')
    .alias('galaku-esp32s3')
    .action(async (_, operation = 'help', value = '') => {
      const normalizedOperation = operation.trim().toLowerCase()

      if (isHelpOperation(normalizedOperation)) {
        return getUsage(config, messageHitEnabled)
      }

      if (normalizedOperation === 'bridge') {
        return [
          `GALAKU 桥接地址：${config.host}:${config.port}`,
          '请在持有 ESP32-S3 COM 口的 Windows 机器上启动 tools/galaku-serial-bridge.ps1。',
        ].join('\n')
      }

      if (normalizedOperation === 'messagehit') {
        const normalizedValue = value.trim().toLowerCase()

        if (normalizedValue === 'on') {
          messageHitEnabled = true
          return `GALAKU messagehit on\n新消息将触发 HIT ${config.messageHitDamage}。`
        }

        if (normalizedValue === 'off') {
          messageHitEnabled = false
          return 'GALAKU messagehit off'
        }

        if (normalizedValue === '' || normalizedValue === 'status') {
          return `GALAKU messagehit ${messageHitEnabled ? 'on' : 'off'}\n新消息 HIT damage：${config.messageHitDamage}`
        }

        return '用法：galaku messagehit <on|off|status>'
      }

      try {
        const command = buildSerialCommand(operation, value, config.allowRaw)
        const result = await sendBridgeLine(config, command.line)
        const reply = selectProtocolReply(result.reply, result.line)
        const lines = [`GALAKU ${reply || `OK SENT ${result.line}`}`]

        if (command.note) {
          lines.push(command.note)
        }

        return lines.join('\n')
      } catch (error) {
        return `GALAKU 命令失败：${error instanceof Error ? error.message : String(error)}`
      }
    })
}

async function getUsage(config: Config, messageHitEnabled: boolean): Promise<string> {
  return [
    await getDeviceStatus(config),
    `功能开关：messagehit ${messageHitEnabled ? 'on' : 'off'}，damage=${config.messageHitDamage}`,
    '',
    '用法：galaku <status|ping|scan|services|set|hit|stop|bridge|help>',
    '示例：',
    'galaku',
    'galaku help',
    'galaku --help',
    'galaku ?',
    'galaku status',
    'galaku set 30',
    'galaku hit 1.5',
    'galaku stop',
    'galaku messagehit on',
    'galaku messagehit off',
  ].join('\n')
}

async function getDeviceStatus(config: Config): Promise<string> {
  try {
    const result = await sendBridgeLine(config, 'STATUS')
    const reply = selectProtocolReply(result.reply, result.line)
    return `设备状态：${reply || '桥已连接，但没有返回 STATUS。'}`
  } catch (error) {
    return `设备状态：不可用（${error instanceof Error ? error.message : String(error)}）`
  }
}

function isHelpOperation(operation: string): boolean {
  return operation === 'help' || operation === '--help' || operation === '-h' || operation === '-?' || operation === '?'
}

function isGalakuCommandMessage(content = ''): boolean {
  return /\bgalaku(?:-esp32s3)?\b/i.test(content)
}

export { buildSerialCommand, normalizeBridgeLine, selectProtocolReply } from './protocol'
export { sendBridgeLine } from './bridge'
