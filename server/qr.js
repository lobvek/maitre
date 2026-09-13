// Generación de QR (PNG y SVG) para cada mesa.
import QRCode from 'qrcode';

export function tableUrl(baseUrl, venueSlug, tableToken) {
  return `${String(baseUrl).replace(/\/$/, '')}/m/${venueSlug}/${tableToken}`;
}

export function qrPng(text, { size = 720, margin = 1, dark = '#1a1a1a', light = '#ffffff' } = {}) {
  return QRCode.toBuffer(text, {
    type: 'png', width: size, margin, errorCorrectionLevel: 'M', color: { dark, light },
  });
}

export function qrSvg(text, { margin = 1, dark = '#1a1a1a', light = '#ffffff' } = {}) {
  return QRCode.toString(text, { type: 'svg', margin, errorCorrectionLevel: 'M', color: { dark, light } });
}

export function qrDataUrl(text, opts = {}) {
  return QRCode.toDataURL(text, { margin: 1, width: 320, errorCorrectionLevel: 'M', ...opts });
}
