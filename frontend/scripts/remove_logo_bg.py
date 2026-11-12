"""
One-off dev script: remove the dark background from public/logo.png.

Strategy:
1. Flood-fill from the image borders across dark pixels (the background is
   near-black) — removes the background + any compression smudges connected
   to it, while never touching dark-ish pixels enclosed by logo shapes.
2. Feather the cut: for 2px of opaque pixels bordering the removed area,
   set alpha from luminance so anti-aliased edges don't leave dark halos.
3. Auto-crop to content with a small margin.
"""
from PIL import Image
import numpy as np
from collections import deque

SRC = r"C:/Users/kanna/OneDrive/Desktop/intern/Agentic AI/sales-agent-repo/public/logo.png"
DST = r"C:/Users/kanna/OneDrive/Desktop/intern/Agentic AI/sales-agent-repo/public/logo-transparent.png"

im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(np.int32)
h, w, _ = a.shape

# luminance — the background is uniformly dark
lum = (a[:, :, 0] * 299 + a[:, :, 1] * 587 + a[:, :, 2] * 114) // 1000

DARK = 60  # anything this dark is background-candidate

bg = np.zeros((h, w), dtype=bool)
queue = deque()
for x in range(w):
    for y in (0, h - 1):
        if lum[y, x] < DARK and not bg[y, x]:
            bg[y, x] = True
            queue.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if lum[y, x] < DARK and not bg[y, x]:
            bg[y, x] = True
            queue.append((y, x))

while queue:
    y, x = queue.popleft()
    for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
        if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and lum[ny, nx] < DARK:
            bg[ny, nx] = True
            queue.append((ny, nx))

# interior seeds: pure-black pixels anywhere (swoosh inner area) get the same
# flood treatment so enclosed background vanishes too
seed = np.argwhere(lum < 25)
for y, x in seed:
    if not bg[y, x]:
        bg[y, x] = True
        queue.append((y, x))
while queue:
    y, x = queue.popleft()
    for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
        if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and lum[ny, nx] < DARK:
            bg[ny, nx] = True
            queue.append((ny, nx))

alpha = np.where(bg, 0, 255).astype(np.int32)

# feather: 2px band of previously-opaque pixels next to transparency gets
# luminance-ramped alpha (kills dark anti-alias halos)
for _ in range(2):
    opaque = alpha > 0
    near_bg = (
        np.roll(bg, 1, 0) | np.roll(bg, -1, 0) | np.roll(bg, 1, 1) | np.roll(bg, -1, 1)
    ) & opaque
    ramp = np.clip((lum - 35) * 255 // (120 - 35), 0, 255)
    alpha[near_bg] = np.minimum(alpha[near_bg], ramp[near_bg])
    bg = bg | near_bg  # expand for the second ring

out = np.dstack([np.asarray(im), alpha.astype(np.uint8)])
img = Image.fromarray(out, "RGBA")

# crop to content + margin
bbox = img.getchannel("A").getbbox()
if bbox:
    l, t, r, b = bbox
    m = 12
    img = img.crop((max(0, l - m), max(0, t - m), min(w, r + m), min(h, b + m)))

img.save(DST)
print("saved", DST, "size:", img.size)
