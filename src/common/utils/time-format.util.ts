
/**
 * Convert seconds to SRT timestamp: 00:01:23,456
 */
export function toSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return (
    String(h).padStart(2, '0') +
    ':' +
    String(m).padStart(2, '0') +
    ':' +
    String(s).padStart(2, '0') +
    ',' +
    String(ms).padStart(3, '0')
  );
}

/**
 * Convert seconds to VTT timestamp: 00:01:23.456
 */
export function toVttTime(seconds: number): string {
  return toSrtTime(seconds).replace(',', '.');
}