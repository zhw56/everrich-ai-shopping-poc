import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { NetworkInterfaceInfo } from 'node:os';
import { shareBaseUrl } from '../src/comparison.js';
import { comparisons } from '../src/store.js';
import { generateComparison } from '../src/tools/generate_comparison.js';
import { compareRouter } from '../src/routes/compare.js';
import { createSession } from '../src/types.js';
import { bundleById } from '../src/engine/index.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { SETTINGS_FILE, saveSettings } from '../src/config/settings.js';

const ctx = { session: createSession('test-comparison') };
const ids = ['prod-skii-essence-230', 'prod-lancome-serum-100', 'prod-esteelauder-anr-100', 'prod-lamer-cream-60', 'prod-kiehls-cream-125'];
const plan = (i: number) => ({ type: 'product' as const, id: ids[i] });
const nic = (address: string, internal = false): NetworkInterfaceInfo => ({ address, internal, family: 'IPv4', netmask: '255.255.255.0', mac: '', cidr: null });

test('QR uses a LAN NIC, excluding loopback and VPN; explicit origin is validated', () => {
  assert.equal(shareBaseUrl('', {lo0:[nic('127.0.0.1',true)],utun0:[nic('10.0.0.2')],en0:[nic('192.168.1.42')]}), 'http://192.168.1.42:5173');
  assert.equal(shareBaseUrl('', {lo0:[nic('127.0.0.1',true)]}), null);
  assert.equal(shareBaseUrl('https://demo.example.com/'), 'https://demo.example.com');
  assert.equal(shareBaseUrl('http://192.168.1.42:4173'), 'http://192.168.1.42:4173');
  for (const url of ['http://localhost:5173','https://localhost','https://127.0.0.1','http://evil.example','https://u:p@example.com','https://example.com/path','https://example.com/?token=x']) assert.equal(shareBaseUrl(url), null, url);
});

test('comparison rejects invalid counts, duplicates, unknown types and missing IDs without storing', async () => {
  const before = comparisons.size;
  for (const items of [[],[plan(0)],[plan(0),plan(0)], [plan(0),plan(1),plan(2),plan(3),plan(4)], [{type:'wrong',id:'x'},plan(0)], [plan(0),{type:'product',id:'missing'}]]) {
    const result = await generateComparison.run({ items } as Parameters<typeof generateComparison.run>[0],ctx);
    assert.equal(result.ok,false);
  }
  assert.equal(comparisons.size,before);
});

test('GET comparison keeps engine prices, source and mock flags; QR and missing links handled', async () => {
  const result = await generateComparison.run({title:'測試比較',items:[plan(0),{type:'bundle',id:'mock-bundle-03'}]},ctx);
  assert.equal(result.ok,true);
  const id = (result.data as {id:string}).id;
  const record = comparisons.get(id)!;
  assert.equal(record.rows[0].type,'product');
  assert.equal(record.rows[1].type,'bundle');
  if (record.rows[1].type === 'bundle') assert.equal(record.rows[1].total_cost,bundleById('mock-bundle-03')!.total_cost);
  assert.ok(record.rows.every(row => row.verified === false));
  assert.ok(record.sources.length > 0);
  assert.ok(!JSON.stringify(record).includes('0900-'));
  const previous = process.env.SHARE_BASE_URL;
  // 後台設定的分享網址優先於環境變數；測試期間暫時清空，結束後還原原檔
  const settingsBackup = existsSync(SETTINGS_FILE) ? readFileSync(SETTINGS_FILE, 'utf8') : null;
  saveSettings({ share_base_url: '' });
  process.env.SHARE_BASE_URL='http://192.168.1.42:5173';
  const app=express(); app.use('/api/compare',compareRouter);
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve => server.once('listening',resolve));
  const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const response=await fetch(`${origin}/api/compare/${id}`);
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
    const {data}=await response.json();
    assert.deepEqual(data.rows,record.rows);
    assert.equal(data.share_url,`http://192.168.1.42:5173/compare/${id}`);
    assert.match(data.qr_code,/^data:image\/png;base64,/);
    assert.equal(Buffer.from(data.qr_code.split(',')[1],'base64').subarray(1,4).toString(),'PNG');
    process.env.SHARE_BASE_URL='http://localhost:5173';
    const unavailable=await (await fetch(`${origin}/api/compare/${id}`)).json();
    assert.equal(unavailable.data.share_url,null); assert.equal(unavailable.data.qr_code,null);
    assert.deepEqual(unavailable.data.rows,record.rows);
    assert.equal((await fetch(`${origin}/api/compare/cmp-missing`)).status,404);
    comparisons.delete(id);
    assert.equal((await fetch(`${origin}/api/compare/${id}`)).status,404);
  } finally {
    if (previous === undefined) delete process.env.SHARE_BASE_URL; else process.env.SHARE_BASE_URL=previous;
    if (settingsBackup !== null) writeFileSync(SETTINGS_FILE, settingsBackup);
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
