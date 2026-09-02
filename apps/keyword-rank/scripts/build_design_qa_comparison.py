from pathlib import Path
from PIL import Image, ImageDraw

project = Path(__file__).resolve().parents[1]
source_path = Path(r"C:\Users\Admin\.codex\generated_images\01a01438-360c-7c93-ba35-901895ca5c0d\exec-cafa7ea1-b220-426a-b12d-333383b4f785.png")
implementation_path = project / "qa" / "implementation-v1.2.0.png"
icon_preview_path = project / "build" / "app-icon-preview.png"
embedded_icon_path = project / "qa" / "embedded-exe-icon-zoom.png"
output_path = project / "qa" / "design-comparison-v1.2.0.png"

source = Image.open(source_path).convert("RGB").crop((94, 0, 1600, 225))
implementation = Image.open(implementation_path).convert("RGB").crop((0, 0, 1536, 225))
source = source.resize((1536, 230), Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS)

icon_preview = Image.open(icon_preview_path).convert("RGB").resize((780, 255))
embedded_icon = Image.open(embedded_icon_path).convert("RGBA").resize((255, 255))

canvas = Image.new("RGB", (1536, 805), "#E8EDF2")
draw = ImageDraw.Draw(canvas)
draw.rectangle((0, 0, 1536, 28), fill="#173B64")
draw.text((12, 7), "SOURCE TARGET - TOP CHROME", fill="white")
canvas.paste(source, (0, 28))
draw.rectangle((0, 258, 1536, 286), fill="#173B64")
draw.text((12, 265), "IMPLEMENTATION - TOP CHROME", fill="white")
canvas.paste(implementation, (0, 286))
draw.rectangle((0, 511, 1536, 539), fill="#173B64")
draw.text((12, 518), "ICON QA - MULTI-SIZE SOURCE / EMBEDDED 32PX", fill="white")
canvas.paste(icon_preview, (0, 539))
checker = Image.new("RGB", (300, 255), "#FFF7E6")
checker.paste(embedded_icon, (22, 0), embedded_icon)
canvas.paste(checker, (820, 539))
draw.text((1138, 645), "EXE embedded icon\nnearest-neighbor zoom", fill="#173B64")
canvas.save(output_path)
print(output_path)
