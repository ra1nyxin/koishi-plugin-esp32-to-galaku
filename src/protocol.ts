export interface CommandBuildResult {
  line: string
  note?: string
}

export function normalizeBridgeLine(line: string): string {
  const normalized = line.replace(/[\r\n]/g, ' ').trim()

  if (!normalized) {
    throw new Error('command is empty')
  }

  if (normalized.length > 64) {
    throw new Error('command is longer than 64 characters')
  }

  if (!/^[\x20-\x7e]+$/.test(normalized)) {
    throw new Error('command must be printable ASCII')
  }

  return normalized
}

export function buildSerialCommand(operation = 'status', value = '', allowRaw = false): CommandBuildResult {
  const op = operation.trim().toLowerCase()
  const arg = value.trim()

  switch (op) {
    case '':
    case 'status':
    case 'stat':
      return { line: 'STATUS' }

    case 'ping':
      return { line: 'PING' }

    case 'scan':
      return { line: 'SCAN' }

    case 'services':
    case 'svc':
      return { line: 'SERVICES' }

    case 'stop':
    case 'off':
      return { line: 'STOP' }

    case 'set':
      return buildSetCommand(arg)

    case 'hit':
      return buildHitCommand(arg || '1')

    case 'raw':
      if (!allowRaw) {
        throw new Error('raw 命令已被插件配置禁用')
      }
      return { line: normalizeBridgeLine(arg), note: '已发送 raw 命令' }

    default:
      throw new Error(`unknown operation: ${operation}`)
  }
}

export function selectProtocolReply(rawReply: string, commandLine = ''): string {
  const lines = rawReply
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(PONG|STATUS\b|OK\b|ERR\b|SERVICES\b)/.test(line))

  if (!lines.length) return ''

  const verb = commandLine.trim().split(/\s+/, 1)[0]?.toUpperCase()
  const expected = expectedReplyPattern(verb)
  const matches = lines.filter((line) => expected.test(line))

  return matches.at(-1) ?? lines.at(-1) ?? ''
}

function expectedReplyPattern(verb: string): RegExp {
  switch (verb) {
    case 'PING':
      return /^PONG$/
    case 'STATUS':
      return /^STATUS\b/
    case 'SCAN':
      return /^OK SCAN\b/
    case 'SERVICES':
      return /^(OK SERVICES\b|SERVICES failed\b|ERR\b)/
    case 'SET':
      return /^OK SET\b/
    case 'HIT':
      return /^OK HIT\b/
    case 'STOP':
      return /^OK STOP\b/
    default:
      return /^(PONG|STATUS\b|OK\b|ERR\b|SERVICES\b)/
  }
}

function buildSetCommand(value: string): CommandBuildResult {
  const level = Number.parseInt(value, 10)

  if (!Number.isFinite(level)) {
    throw new Error('set requires a level from 0 to 100')
  }

  const clamped = Math.max(0, Math.min(100, level))
  return {
    line: `SET ${clamped}`,
    note: clamped === level ? undefined : `level clamped from ${level} to ${clamped}`,
  }
}

function buildHitCommand(value: string): CommandBuildResult {
  const damage = Number.parseFloat(value)

  if (!Number.isFinite(damage) || damage <= 0) {
    throw new Error('hit requires a positive damage number')
  }

  return { line: normalizeBridgeLine(`HIT ${damage}`) }
}
