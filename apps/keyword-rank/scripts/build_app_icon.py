from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

RESAMPLE_LANCZOS = getattr(getattr(Image, "Resampling", Image), "LANCZOS")


def connected_background(image: Image.Image) -> list[list[bool]]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    background = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()

    def looks_like_grey(x: int, y: int) -> bool:
        red, green, blue = pixels[x, y]
        return max(red, green, blue) - min(red, green, blue) < 58

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if background[y][x] or not looks_like_grey(x, y):
            continue
        background[y][x] = True
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))
    return background


def extract_icon(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    background = connected_background(image)
    alpha = Image.new("L", image.size, 255)
    alpha_pixels = alpha.load()
    for y, row in enumerate(background):
        for x, is_background in enumerate(row):
            if is_background:
                alpha_pixels[x, y] = 0
    image.putalpha(alpha)
    box = image.getbbox()
    if not box:
        raise RuntimeError("No foreground icon was detected.")
    cropped = image.crop(box)
    side = max(cropped.size)
    padding = round(side * 0.055)
    canvas = Image.new("RGBA", (side + 2 * padding, side + 2 * padding), (0, 0, 0, 0))
    canvas.alpha_composite(cropped, ((canvas.width - cropped.width) // 2, (canvas.height - cropped.height) // 2))
    return canvas.resize((1024, 1024), RESAMPLE_LANCZOS)


def make_preview(icon: Image.Image, destination: Path) -> None:
    canvas = Image.new("RGB", (1040, 340), "#FFF7E6")
    draw = ImageDraw.Draw(canvas)
    sizes = [256, 128, 64, 48, 32, 24, 16]
    x = 30
    baseline = 278
    for size in sizes:
        scaled = icon.resize((size, size), RESAMPLE_LANCZOS)
        canvas.paste(scaled, (x, baseline - size), scaled)
        draw.text((x, baseline + 10), f"{size}px", fill="#173B64")
        x += max(size, 70) + 30
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("png", type=Path)
    parser.add_argument("ico", type=Path)
    parser.add_argument("preview", type=Path)
    args = parser.parse_args()

    icon = extract_icon(args.source)
    args.png.parent.mkdir(parents=True, exist_ok=True)
    args.ico.parent.mkdir(parents=True, exist_ok=True)
    icon.save(args.png)
    icon.save(
        args.ico,
        format="ICO",
        sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)],
        bitmap_format="png",
    )
    make_preview(icon, args.preview)


if __name__ == "__main__":
    main()
