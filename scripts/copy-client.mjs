import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(join(root, 'lib', 'types'), { recursive: true })
await copyFile(join(root, 'client', 'client.js'), join(root, 'lib', 'client.js'))
await copyFile(join(root, 'client', 'client.d.ts'), join(root, 'lib', 'types', 'client.d.ts'))
