# Trinity-2: framing, camera, backgrounds and custom avatars

Trinity-2 is Simli's current avatar generation: waist-up, torso and hands, built from one photo. All preset faces are Trinity-2. Older faces (Trinity-1, legacy) ignore everything on this page and keep their own frame size (512x512 for Trinity-1), but the framing fields are still validated.

Live docs: https://docs.simli.com/api-reference/trinity-2.md, https://docs.simli.com/api-reference/trinity-2/camera.md, https://docs.simli.com/api-reference/trinity-2/backgrounds.md

## Framing the video

Set these in the session config (JS token config, Python `SimliConfig`, `POST /compose/token` body; for LiveKit and Pipecat see their workarounds in [livekit.md](livekit.md) and [pipecat.md](pipecat.md)):

| Field | Default | Meaning |
|---|---|---|
| `streaming_width` | `768` | Video width in px, at least 512 |
| `streaming_height` | `768` | Video height in px, at least 512 |
| `avatar_position_x` | `0.5` | 0 = left edge, 1 = right edge |
| `avatar_position_y` | `1.0` | 0 = top, 1 = bottom (default: standing at the bottom centre) |

Width and height together must be **1:1, 16:9 or 9:16** (within a pixel: 1366x768 counts as 16:9). Anything else, a side under 512, or a position outside 0–1 returns **422**.

Pick by layout:

| Layout | Size |
|---|---|
| Square tile, widget, chat bubble | 768x768 (default) or 512x512 |
| Desktop video call, landing-page hero | 1366x768 (16:9) |
| Mobile, portrait kiosk, vertical video | 768x1366 (9:16) |

Then make the player match: the frontend element's aspect ratio (CSS `aspect-ratio`), and in Pipecat the transport's `video_out_width/height`.

## Camera

`camera` sets a starting camera; SDKs can change it live (`setCamera`). All fields are offsets from the avatar's own framing, and each call replaces the whole camera (omitted fields are neutral; `null`/`None` resets).

| Field | Meaning | Range |
|---|---|---|
| `zoom` | multiplies the zoom; 1 = unchanged | >0 to 4 |
| `pos_x_off`, `pos_y_off` | move the avatar right / down, in half canvas widths / heights | -10 to 10 |
| `pos_z_off` | metres the camera backs away (negative moves in) | -5 to 5 |
| `rot_x_off`, `rot_y_off`, `rot_z_off` | camera tilt up / pan right / roll clockwise, degrees | -180 to 180 |
| `orbit_x_off` | orbit up over the head, degrees | -80 to 80 |
| `orbit_y_off` | orbit round to the camera's right, degrees | -180 to 180 |

Out-of-range values are applied anyway, with a warning. Good starting points: head-and-shoulders close-up `{"zoom": 1.6}`; slight three-quarter view `{"orbit_y_off": 15}`.

Live, JS: `client.setCamera({ zoom: 1.5, orbit_y_off: 20 }, { lerpSeconds: 2 })` (glides; omit `lerpSeconds` to cut). Python: `await connection.setCamera(CameraSetting(zoom=1.5, orbit_y_off=20), lerp_seconds=2)`.

## Backgrounds and foregrounds

Upload first, then reference by id.

```bash
curl -X POST https://api.simli.ai/assets/backgrounds -H "x-simli-api-key: $SIMLI_API_KEY" -F "image=@office.jpg"
# -> {"id": "6f1c2a9e-...", "width": 1920, "height": 1080, ...}
```

- JPEG/PNG/WEBP under 5 MB, shaped 16:9, 9:16 or 1:1, shorter side >= 512, at most 1920x1080 / 1080x1920 / 1080x1080.
- Foregrounds (`POST /assets/foregrounds`) need transparency (PNG/WEBP with alpha); they're laid over the avatar.
- Uploads go through a content-safety check (a few seconds). Errors: 400 (wrong type/shape/size, or flagged), 413 (too big), 503 (check unavailable; retry).
- List: `GET /assets/backgrounds`; delete: `DELETE /assets/backgrounds/{id}` (permanent — confirm with the user first).

Start with one: `background_id` / `foreground_id` in the session config. Swap live: JS `client.setBackground(id)` / `setForeground(id)`, Python `await connection.setBackground(id)`; `null`/`None` resets. An id that isn't the account's own is dropped with a warning; the session continues with the avatar's own background.

The background is cropped to fill the canvas, so upload it in the same shape as the stream.

## Creating a custom avatar from a photo

Easiest: the dashboard, https://app.simli.com (Create avatar). Via API:

1. **Reframe the photo** — `POST /faces/trinity/preprocess` (multipart `image`). JPEG/PNG/WEBP under 5 MB, at least 512x512, one person facing the camera, head at least 15% of the image height. Returns the reframed PNG; the `target-ratio` response header is needed next, and a `warnings` header lists advice.

   ```bash
   curl -X POST https://api.simli.ai/faces/trinity/preprocess -H "x-simli-api-key: $SIMLI_API_KEY" \
     -F "image=@portrait.jpg" -D headers.txt -o framed.png
   ```

2. **Start the build** — `POST /faces/trinity?face_name=my_avatar` with the reframed image and the `target-ratio` header. Returns `face_id`.

   ```bash
   RATIO=$(grep -i '^target-ratio:' headers.txt | cut -d' ' -f2 | tr -d '\r')
   curl -X POST "https://api.simli.ai/faces/trinity?face_name=my_avatar" -H "x-simli-api-key: $SIMLI_API_KEY" \
     -H "target-ratio: $RATIO" -F "image=@framed.png"
   ```

3. **Wait** — usually **about 4 hours**. Poll `GET /faces/trinity/generation_status?face_id=...` until `status` is `completed` or `failed`. Builds start at least 10 minutes apart (`dispatch_after` shows when a queued one can start).

Each build uses one of the plan's Trinity-2 generations (a failed build uses none). With none left, both calls return 403. While the custom face builds, develop against a preset face and switch `SIMLI_FACE_ID` when it's ready. Tell the user about the 4-hour wait up front.

`GET /faces` lists the account's faces; `GET /face/{id}` checks a face can be used (yours, or public).
