// Creating a dummy audiobook MP3 file so download endpoints actually fetch valid binaries
import fs from 'fs';
import path from 'path';

const audiobooksDir = path.join(process.cwd(), 'server', 'audiobooks');
if (!fs.existsSync(audiobooksDir)) {
  fs.mkdirSync(audiobooksDir, { recursive: true });
}

// Generate simple mock MP3 content (1MB of mock sound data headers or zero-filled buffer)
const mockMp3Path = path.join(audiobooksDir, 'resilience_audiobook.mp3');
if (!fs.existsSync(mockMp3Path)) {
  const dummyBuffer = Buffer.alloc(1024 * 1024); // 1MB
  dummyBuffer.write("ID3v2.3.0...Thomas Akwasi Baafi - Resilience Audiobook");
  fs.writeFileSync(mockMp3Path, dummyBuffer);
}
