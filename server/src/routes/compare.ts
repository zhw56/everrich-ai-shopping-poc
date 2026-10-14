import { Router } from 'express';
import QRCode from 'qrcode';
import { comparisons } from '../store.js';
import { loadSettings } from '../config/settings.js';
import { shareBaseUrl } from '../comparison.js';

export const compareRouter = Router();
compareRouter.get('/:id', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const id = String(req.params.id);
  const comparison = /^cmp-[a-zA-Z0-9-]{1,100}$/.test(id) ? comparisons.get(id) : undefined;
  if (!comparison) {
    res.status(404).json({ ok: false, error: 'COMPARISON_NOT_FOUND' });
    return;
  }
  const base = shareBaseUrl(loadSettings().share_base_url || process.env.SHARE_BASE_URL);
  const share_url = base ? `${base}/compare/${encodeURIComponent(id)}` : null;
  try {
    const qr_code = share_url ? await QRCode.toDataURL(share_url, { width: 256, margin: 4, errorCorrectionLevel: 'M' }) : null;
    res.json({ ok: true, data: { ...comparison, share_url, qr_code, share_notice: share_url
      ? '手機與電腦請連同一個 Wi-Fi；電腦與展示服務需保持開啟。伺服器重新啟動後，這份比較表會失效。'
      : '目前沒有可供手機連線的分享網址，仍可查看與列印比較表。請連上 Wi-Fi，或由管理者在後台「系統參數」設定分享網址。' } });
  } catch {
    // A QR rendering failure must not hide the comparison or prevent printing.
    res.json({ ok: true, data: { ...comparison, share_url, qr_code: null, share_notice: 'QR code 暫時無法產生，請使用下方分享連結。' } });
  }
});
