import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'

describe('IPC contract', () => {
  it('has no duplicate channel names', () => {
    const all = [...IPC_CHANNELS, ...IPC_EVENTS]
    expect(new Set(all).size).toBe(all.length)
  })

  it('namespaces every channel as area:action', () => {
    for (const channel of [...IPC_CHANNELS, ...IPC_EVENTS]) {
      expect(channel).toMatch(/^[a-z]+:[a-z][a-z-]*$/)
    }
  })

  it('prefixes push events so they can never collide with invoke channels', () => {
    for (const event of IPC_EVENTS) {
      expect(event.startsWith('event:')).toBe(true)
    }
    for (const channel of IPC_CHANNELS) {
      expect(channel.startsWith('event:')).toBe(false)
    }
  })
})
