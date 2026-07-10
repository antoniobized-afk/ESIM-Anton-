export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function getDownloadFilename(
  contentDisposition: string | undefined,
  fallback: string,
): string {
  if (!contentDisposition) return fallback

  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].replace(/"/g, ''))
    } catch {
      return fallback
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  return plainMatch?.[1] || fallback
}

export function toDownloadBlob(data: Blob | BlobPart, mimeType: string): Blob {
  return data instanceof Blob ? data : new Blob([data], { type: mimeType })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
