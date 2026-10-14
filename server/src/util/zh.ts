import * as OpenCC from 'opencc-js/cn2t';

/**
 * 簡體轉台灣正體（字元層級＋台灣異體字）。
 * 不用 twp：它的台灣詞彙轉換會改動已是繁體的內容（數據→資料、項目→專案、智能→智慧）。
 * 繁體文字大多不受影響；下列在繁體中常用、但 OpenCC 預設會改寫的字保留原字（台→臺、干→幹）。
 * 英文夾雜只能靠提示詞。
 */
const convert = OpenCC.Converter({ from: 'cn', to: 'tw' });
const KEEP = new Set(['台', '干']);

export function toTaiwan(text: string): string {
  if (!text) return text;
  const out = convert(text);
  if (out === text) return out;
  const a = Array.from(text);
  const b = Array.from(out);
  if (a.length !== b.length) return out;
  for (let i = 0; i < a.length; i++) if (KEEP.has(a[i])) b[i] = a[i];
  return b.join('');
}
