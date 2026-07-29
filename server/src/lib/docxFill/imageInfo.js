// Minimal PNG/JPEG pixel-size sniffing — good enough to keep embedded
// images at their correct aspect ratio without pulling in an image library.
export function getImageDimensions(buffer, fallbackExt) {
  if (buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), ext: 'png' };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7), ext: 'jpeg' };
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      offset += 2 + segmentLength;
    }
  }
  return { width: 800, height: 600, ext: fallbackExt || 'png' };
}

export function scaleToMaxWidthEmu(width, height, maxWidthEmu) {
  const EMU_PER_PX = 9525;
  const widthEmu = width * EMU_PER_PX;
  const heightEmu = height * EMU_PER_PX;
  if (widthEmu <= maxWidthEmu) return { cx: widthEmu, cy: heightEmu };
  const ratio = maxWidthEmu / widthEmu;
  return { cx: Math.round(widthEmu * ratio), cy: Math.round(heightEmu * ratio) };
}
