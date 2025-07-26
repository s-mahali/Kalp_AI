// Add this class to your project file
import { Transform } from 'stream';

export class AudioChunker extends Transform {
  constructor(chunkSize, options) {
    super(options);
    this.chunkSize = chunkSize;
    this.internalBuffer = Buffer.alloc(0);
  }

  _transform(chunk, encoding, callback) {
    this.internalBuffer = Buffer.concat([this.internalBuffer, chunk]);
    while (this.internalBuffer.length >= this.chunkSize) {
      const chunkToSend = this.internalBuffer.subarray(0, this.chunkSize);
      this.internalBuffer = this.internalBuffer.subarray(this.chunkSize);
      this.push(chunkToSend);
    }
    callback();
  }

  _flush(callback) {
    if (this.internalBuffer.length > 0) {
      this.push(this.internalBuffer);
    }
    callback();
  }
}

// Add this class as well for the Murf.ai audio
export class MonoToStereo extends Transform {
  _transform(chunk, encoding, callback) {
    const stereoBuffer = Buffer.alloc(chunk.length * 2);
    for (let i = 0; i < chunk.length; i += 2) {
      const sample = chunk.readInt16LE(i);
      stereoBuffer.writeInt16LE(sample, i * 2);
      stereoBuffer.writeInt16LE(sample, i * 2 + 2);
    }
    this.push(stereoBuffer);
    callback();
  }
}