import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSerialCommand, normalizeBridgeLine, selectProtocolReply } from '../lib/protocol.js'

test('builds known ESP32-S3 serial commands', () => {
  assert.deepEqual(buildSerialCommand('status'), { line: 'STATUS' })
  assert.deepEqual(buildSerialCommand('ping'), { line: 'PING' })
  assert.deepEqual(buildSerialCommand('scan'), { line: 'SCAN' })
  assert.deepEqual(buildSerialCommand('services'), { line: 'SERVICES' })
  assert.deepEqual(buildSerialCommand('stop'), { line: 'STOP' })
  assert.deepEqual(buildSerialCommand('hit', '1.5'), { line: 'HIT 1.5' })
})

test('clamps set level to ESP32 range', () => {
  assert.deepEqual(buildSerialCommand('set', '250'), {
    line: 'SET 100',
    note: 'level clamped from 250 to 100',
  })
  assert.deepEqual(buildSerialCommand('set', '-9'), {
    line: 'SET 0',
    note: 'level clamped from -9 to 0',
  })
})

test('guards raw commands unless enabled', () => {
  assert.throws(() => buildSerialCommand('raw', 'STATUS'), /禁用/)
  assert.deepEqual(buildSerialCommand('raw', 'STATUS', true), {
    line: 'STATUS',
    note: '已发送 raw 命令',
  })
})

test('normalizes bridge lines for the PowerShell bridge', () => {
  assert.equal(normalizeBridgeLine('  SET 10\r\n'), 'SET 10')
  assert.throws(() => normalizeBridgeLine(''), /empty/)
  assert.throws(() => normalizeBridgeLine('SET 測試'), /printable ASCII/)
  assert.throws(() => normalizeBridgeLine('X'.repeat(65)), /64/)
})

test('selects protocol replies from noisy ESP32 serial logs', () => {
  const noisy = [
    'I (2898975) NimBLE: GATT procedure initiated: write;',
    'I (2898975) NimBLE: att_handle=10 len=12',
    '',
    'I (2899145) NimBLE: GATT procedure initiated: write;',
    'OK HIT damage=1.00 level=10',
  ].join('\n')

  assert.equal(selectProtocolReply(noisy, 'HIT 1'), 'OK HIT damage=1.00 level=10')
  assert.equal(selectProtocolReply('PONG\n', 'PING'), 'PONG')
  assert.equal(selectProtocolReply('noise only', 'PING'), '')
})
