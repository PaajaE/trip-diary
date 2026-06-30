import { stdin } from 'node:process'

const input = await new Promise((resolve, reject) => {
  let data = ''
  stdin.setEncoding('utf8')
  stdin.on('data', (chunk) => {
    data += chunk
  })
  stdin.on('end', () => {
    resolve(data)
  })
  stdin.on('error', reject)
})

const output = input
  .replaceAll(
    `          p_latitude: number
          p_longitude: number
          p_status: Database["public"]["Enums"]["entry_status"]`,
    `          p_latitude: number | null
          p_longitude: number | null
          p_status: Database["public"]["Enums"]["entry_status"]`,
  )
  .replaceAll(
    `          p_latitude: number
          p_longitude: number
          p_status: Database['public']['Enums']['entry_status']`,
    `          p_latitude: number | null
          p_longitude: number | null
          p_status: Database['public']['Enums']['entry_status']`,
  )

process.stdout.write(output)
