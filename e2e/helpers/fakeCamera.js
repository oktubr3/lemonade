import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';

// Writes a Y4M video that shows each text as a QR code for `seconds`, one after
// the other, and returns its path. Chromium plays it in a loop as the webcam
// (--use-file-for-fake-video-capture), so the camera path of the importer runs
// for real: same QR in front of the camera for many frames, then the next one,
// like a phone showing a Google Authenticator export.
export function qrVideo(name, texts, { seconds = 3, fps = 5, width = 640, height = 480 } = {}) {
    const frameSize = width * height;
    const frames = texts.map((text) => {
        const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
        const scale = Math.floor(Math.min(width, height) / (modules.size + 8));
        const left = Math.floor((width - modules.size * scale) / 2);
        const top = Math.floor((height - modules.size * scale) / 2);
        const frame = Buffer.alloc(frameSize * 1.5, 128); // 4:2:0, chroma neutral
        frame.fill(255, 0, frameSize); // white luma
        for (let y = 0; y < modules.size; y++) {
            for (let x = 0; x < modules.size; x++) {
                if (!modules.get(y, x)) continue;
                for (let dy = 0; dy < scale; dy++) {
                    frame.fill(0, (top + y * scale + dy) * width + left + x * scale, (top + y * scale + dy) * width + left + (x + 1) * scale);
                }
            }
        }
        return frame;
    });
    const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F${fps}:1 Ip A1:1 C420jpeg\n`);
    const marker = Buffer.from('FRAME\n');
    const parts = [header];
    for (const frame of frames) {
        for (let i = 0; i < seconds * fps; i++) parts.push(marker, frame);
    }
    const dir = join(tmpdir(), 'lemonade-e2e');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${name}.y4m`);
    writeFileSync(path, Buffer.concat(parts));
    return path;
}
