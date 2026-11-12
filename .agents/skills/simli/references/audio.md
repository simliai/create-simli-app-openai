# Audio for Simli

Simli streaming sessions take exactly one format:

- **Raw PCM, signed 16-bit integers, little-endian** (`s16le`)
- **16,000 Hz**
- **Mono**
- **No container or header** (a `.wav` file has a 44-byte header: strip it or convert)

At 16 kHz, one second is 32,000 bytes. Chunks of about 6,000 bytes (~190 ms) work well. Always send an even number of bytes.

Symptoms of the wrong format: silence or a frozen avatar (Float32 sent as Int16, or a header), harsh noise (wrong endianness or Float32), chipmunk or slow-motion speech (wrong sample rate: 24 kHz or 48 kHz sent as 16 kHz), a click at the start (WAV header sent as audio).

## Where common sources land

| Source | What it outputs | What to do |
|---|---|---|
| LiveKit Agents, Pipecat | handled by the integration | nothing |
| ElevenLabs Agents (WebSocket) | base64 PCM at the agent's configured output format | set output format to PCM 16000 Hz; base64-decode; send |
| ElevenLabs TTS API | `output_format=pcm_16000` (use `eleven_flash_v2_5` for low latency; turbo v2.5 is deprecated) | request that format; send |
| Cartesia | raw `pcm_s16le` at the requested rate | request 16000; send |
| OpenAI Realtime (WebSocket) | base64 PCM16 at **24 kHz** | decode, resample 24k → 16k, send |
| OpenAI TTS `response_format=pcm` | PCM16 at **24 kHz** | resample 24k → 16k |
| Browser microphone / Web Audio | Float32 at 44.1 or 48 kHz | use `listenToMediastreamTrack` (the SDK converts), or convert yourself |
| MP3 / Opus / WAV files | encoded / headered | decode with ffmpeg |

## Converting

Files or streams, with ffmpeg:

```bash
ffmpeg -i input.any -f s16le -acodec pcm_s16le -ar 16000 -ac 1 output.pcm
# streaming: read stdin, write stdout
ffmpeg -i pipe:0 -f s16le -acodec pcm_s16le -ar 16000 -ac 1 pipe:1
```

Python, without ffmpeg (numpy):

```python
import numpy as np

def to_simli_pcm(samples: np.ndarray, rate: int) -> bytes:
    """samples: mono float32 in [-1, 1] or int16. Returns PCM16 16 kHz bytes."""
    x = samples.astype(np.float32) / (32768.0 if samples.dtype == np.int16 else 1.0)
    if rate != 16000:
        n = int(len(x) * 16000 / rate)
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
    return (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
```

For better quality when downsampling, use `scipy.signal.resample_poly(x, 2, 3)` (24k → 16k) or `resample_poly(x, 1, 3)` (48k → 16k).

Browser (TypeScript), Int16 24 kHz → Int16 16 kHz by linear interpolation. Good enough for speech; keep a small carry-over between chunks if clicks appear at chunk borders:

```typescript
function resampleInt16(input: Int16Array, fromRate: number, toRate = 16000): Int16Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const out = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    out[i] = Math.round(input[i0] + (input[i1] - input[i0]) * (pos - i0));
  }
  return out;
}

const base64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const int16ToBytes = (a: Int16Array) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
// OpenAI Realtime delta -> Simli
// client.sendAudioData(int16ToBytes(resampleInt16(new Int16Array(base64ToBytes(delta).buffer), 24000)));
```

Float32 → Int16: `Math.max(-1, Math.min(1, s)) * 32767`, rounded.

## Checking a file

`python3 scripts/check_setup.py --audio speech.pcm` reports the duration and flags a WAV header, an odd byte count, or audio that is silent or clipped.
