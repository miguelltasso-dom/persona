// Free TCP port on 127.0.0.1 (OS-assigned, released before the caller binds it). Used by every app launcher (D-067).
import { createServer } from 'node:net'

export function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') { probe.close(() => { reject(new Error('port probe returned no address')) }); return }
      probe.close(() => { resolvePort(address.port) })
    })
  })
}
