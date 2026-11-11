// D-103c: Ctrl+V de imagem no composer. Puro e sem DOM além dos tipos: devolve as imagens que o seletor de imagem do composer
// também aceita (mesma lista do `accept` do <input type="file">), vindas de `files` ou, se vazio, de `items` (alguns clipboards
// só entregam o print por `items`). Uma imagem sem nome ganha `image.<ext>` para o anexo ter um rótulo honesto.

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

type ClipboardLike = {
  readonly files?: ArrayLike<File> | null | undefined
  readonly items?: ArrayLike<{ readonly kind: string; readonly type: string; getAsFile: () => File | null }> | null | undefined
}

function isPastableImage(type: string): boolean {
  return Object.hasOwn(IMAGE_EXTENSIONS, type)
}

function named(file: File): File {
  if (file.name.trim().length > 0) return file
  return new File([file], `image.${IMAGE_EXTENSIONS[file.type] ?? 'png'}`, { type: file.type })
}

export function clipboardImageFiles(data: ClipboardLike | null | undefined): File[] {
  if (data === null || data === undefined) return []
  const fromFiles = Array.from(data.files ?? []).filter(file => isPastableImage(file.type))
  if (fromFiles.length > 0) return fromFiles.map(named)
  const fromItems: File[] = []
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !isPastableImage(item.type)) continue
    const file = item.getAsFile()
    if (file !== null) fromItems.push(file)
  }
  return fromItems.map(named)
}
