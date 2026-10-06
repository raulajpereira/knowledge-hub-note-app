import { describe, expect, it } from 'vitest';
import { sniffAudio } from '@/server/content/voice';

const bytes = (...parts: Array<string | number[]>) =>
  Uint8Array.from(
    parts
      .flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p))
      .concat(Array(16).fill(0)),
  );

// Phase 4: recordings are accepted by their bytes, not the browser's Content-Type.
describe('sniffAudio', () => {
  it('recognises the containers browsers record in', () => {
    expect(sniffAudio(bytes([0x1a, 0x45, 0xdf, 0xa3]))).toBe('audio/webm');
    expect(sniffAudio(bytes('OggS'))).toBe('audio/ogg');
    expect(sniffAudio(bytes([0, 0, 0, 0x20], 'ftypM4A '))).toBe('audio/mp4');
    expect(sniffAudio(bytes('RIFF', [0, 0, 0, 0], 'WAVE'))).toBe('audio/wav');
    expect(sniffAudio(bytes('ID3'))).toBe('audio/mpeg');
  });
  it('refuses anything else', () => {
    expect(sniffAudio(bytes('<html><script>'))).toBeNull();
    expect(sniffAudio(bytes([0x89], 'PNG'))).toBeNull();
    expect(sniffAudio(Uint8Array.from([0x1a, 0x45]))).toBeNull();
  });
});
