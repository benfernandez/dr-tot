declare module 'heic-convert' {
  interface ConvertOptions {
    buffer: Buffer | Uint8Array | ArrayBuffer;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }
  function convert(opts: ConvertOptions): Promise<ArrayBuffer>;
  export default convert;
}
