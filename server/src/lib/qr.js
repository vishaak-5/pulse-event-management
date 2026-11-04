import QRCode from 'qrcode'

/** PNG bytes of a QR code for `content`, `size` pixels square. */
export function qrPng(content, size) {
  return QRCode.toBuffer(content, { type: 'png', width: size, margin: 1, errorCorrectionLevel: 'M' })
}
