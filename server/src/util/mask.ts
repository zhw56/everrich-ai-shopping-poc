export function maskPhone(phone: string): string {
  const d = phone.replace(/[^0-9]/g, '');
  if (d.length < 7) return '***';
  return `${d.slice(0, 4)}-***-${d.slice(-3)}`;
}

export function maskName(name: string): string {
  const chars = [...name];
  if (chars.length < 2) return name;
  chars[1] = '○';
  return chars.join('');
}
