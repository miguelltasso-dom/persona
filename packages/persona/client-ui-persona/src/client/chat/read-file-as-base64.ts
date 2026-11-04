/**
 * Read a browser File as base64 (no data-URL prefix).
 * @param file - User-selected file.
 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('read-failed'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => { reject(reader.error ?? new Error('read-failed')) }
    reader.readAsDataURL(file)
  })
}
