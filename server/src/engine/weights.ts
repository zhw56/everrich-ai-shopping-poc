import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** 優惠推薦權重：省下金額（saving）、品類符合度（fit）、使用門檻（ease） */
export type Weights = { saving: number; fit: number; ease: number };

const FILE = fileURLToPath(new URL('./weights.json', import.meta.url));

export function getWeights(): Weights {
  return JSON.parse(readFileSync(FILE, 'utf8')) as Weights;
}

/** 供後台寫回，原子寫入 */
export function setWeights(w: Weights): Weights {
  const values = [w.saving, w.fit, w.ease];
  if (values.some((x) => typeof x !== 'number' || x < 0) || Math.abs(values.reduce((s, x) => s + x, 0) - 1) > 0.001) {
    throw new Error('權重必須是非負數，且總和為 1');
  }
  const tmp = FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(w, null, 2) + String.fromCharCode(10));
  renameSync(tmp, FILE);
  return w;
}
