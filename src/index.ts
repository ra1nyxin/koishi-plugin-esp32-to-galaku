import { Context, Schema } from 'koishi'
import { sendBridgeLine } from './bridge'
import { buildSerialCommand } from './protocol'

export const name = 'esp32-to-galaku'

export interface Config {
  host: string
  port: number
  timeoutMs: number
  maxReplyBytes: number
  allowRaw: boolean
}

export const Config: Schema<Config> = Schema.object({
  host: Schema.string().default('127.0.0.1').description('PowerShell TCP 串口桥监听地址。'),
  port: Schema.number().min(1).max(65535).default(25363).description('PowerShell TCP 串口桥监听端口。'),
  timeoutMs: Schema.number().min(500).max(30000).default(3500).description('等待桥脚本回复的超时时间，单位毫秒。'),
  maxReplyBytes: Schema.number().min(256).max(65536).default(4096).description('单次命令最多读取的桥脚本回复字节数。'),
  allowRaw: Schema.boolean().default(false).description('允许 galaku raw <command> 发送原始串口命令。'),
})

export function apply(ctx: Context, config: Config) {
  ctx.command('galaku <operation:string> [value:text]', 'ESP32-S3 GALAKU 控制桥')
    .alias('galaku-esp32s3')
    .alias('gk')
    .action(async (_, operation = 'status', value = '') => {
      if (operation.trim().toLowerCase() === 'help') {
        return usage()
      }

      if (operation.trim().toLowerCase() === 'bridge') {
        return [
          `GALAKU 桥接地址：${config.host}:${config.port}`,
          '请在持有 ESP32-S3 COM 口的 Windows 机器上启动 tools/galaku-serial-bridge.ps1。',
        ].join('\n')
      }

      try {
        const command = buildSerialCommand(operation, value, config.allowRaw)
        const result = await sendBridgeLine(config, command.line)
        const lines = [`GALAKU <= ${result.line}`]

        if (command.note) {
          lines.push(command.note)
        }

        lines.push(result.reply ? `GALAKU => ${result.reply}` : '命令已发送，但桥脚本没有返回串口回复。')
        return lines.join('\n')
      } catch (error) {
        return `GALAKU 命令失败：${error instanceof Error ? error.message : String(error)}`
      }
    })
}

function usage(): string {
  return [
    '用法：galaku <status|ping|scan|services|set|hit|stop|bridge>',
    '示例：',
    'galaku status',
    'galaku set 30',
    'galaku hit 1.5',
    'galaku stop',
  ].join('\n')
}

export { buildSerialCommand, normalizeBridgeLine } from './protocol'
export { sendBridgeLine } from './bridge'
