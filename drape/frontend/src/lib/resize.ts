/**
 * Resize large phone photos in the browser before upload.
 * Output is JPEG drawn over white, so transparency never turns black.
 * A PNG that already has transparency is sent unchanged so its cutout survives.
 */
const MAX_SIDE = 1400

async function hasAlpha(bitmap: ImageBitmap): Promise<boolean> {
  const c = document.createElement('canvas')
  c.width = Math.min(64, bitmap.width)
  c.height = Math.min(64, bitmap.height)
  const ctx = c.getContext('2d')
  if (!ctx) return false
  ctx.drawImage(bitmap, 0, 0, c.width, c.height)
  const data = ctx.getImageData(0, 0, c.width, c.height).data
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true
  return false
}

export async function prepareUpload(file: File): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file // the server explains what it cannot read
  }
  try {
    if (file.type === 'image/png' && (await hasAlpha(bitmap)) && file.size < 12 * 1024 * 1024) return file
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.type === 'image/jpeg' && file.size < 4 * 1024 * 1024) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}
