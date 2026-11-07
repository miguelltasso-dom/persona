import { useEffect, useState } from 'react'

/** `undefined` enquanto carrega, `null` quando não dá para mostrar, senão a URL. Sem resolvedor: `null` (a tela mostra o `alt`). */
export function useAttachmentImage(
  resolve: ((attachmentId: string) => Promise<string | null>) | undefined,
  attachmentId: string,
): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(resolve === undefined ? null : undefined)
  useEffect(() => {
    if (resolve === undefined) {
      setUrl(null)
      return undefined
    }
    let alive = true
    setUrl(undefined)
    void resolve(attachmentId).then((next) => { if (alive) setUrl(next) }).catch(() => { if (alive) setUrl(null) })
    return () => { alive = false }
    // `resolve` muda de identidade a cada render do chamador; o anexo é o que decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentId])
  return url
}
