import os
from PIL import Image, ImageDraw, ImageFont

public_dir = r"c:\Users\abeer\OneDrive\Desktop\Eco matrix Solutions\Deployed Code\Timesheet_Recoder SirVersion\v2-nextjs\public"
app_dir = r"c:\Users\abeer\OneDrive\Desktop\Eco matrix Solutions\Deployed Code\Timesheet_Recoder SirVersion\v2-nextjs\src\app"

# Exact sampled colors from the AI generated brand logo:
COLOR_GOLD = "#DF9F1C"        # Vibrant Gold (top right dot)
COLOR_TEAL = "#239D8D"        # Rich Teal (top & middle rows)
COLOR_DEEP_TEAL = "#17524C"   # Deep Dark Teal (bottom row)
COLOR_CHARCOAL = "#181A1B"    # Rich Charcoal for light backgrounds
COLOR_WHITE = "#FFFFFF"       # Solid White for dark backgrounds

def generate_perfect_svg(text_color, filename):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 160" width="680" height="160" fill="none">
  <g transform="translate(10, 25)">
    <!-- Main Title ECOMATRIX -->
    <text x="0" y="66" font-family="'Montserrat', 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif" font-weight="900" font-size="68" fill="{text_color}" letter-spacing="0.5">ECOMATRIX</text>
    <!-- Subtitle ENGINEERING -->
    <text x="3" y="106" font-family="'Montserrat', 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif" font-weight="500" font-size="24" fill="{text_color}" letter-spacing="14">ENGINEERING</text>
  </g>
  
  <!-- 3x3 Dot Matrix Icon Mark -->
  <g transform="translate(525, 25)">
    <!-- Row 1 -->
    <circle cx="16" cy="16" r="14" fill="{COLOR_TEAL}" />
    <circle cx="52" cy="16" r="14" fill="{COLOR_TEAL}" />
    <circle cx="88" cy="16" r="14" fill="{COLOR_GOLD}" />
    
    <!-- Row 2 -->
    <circle cx="16" cy="52" r="14" fill="{COLOR_TEAL}" />
    <circle cx="52" cy="52" r="14" fill="{COLOR_TEAL}" />
    <circle cx="88" cy="52" r="14" fill="{COLOR_TEAL}" />
    
    <!-- Row 3 -->
    <circle cx="16" cy="88" r="14" fill="{COLOR_DEEP_TEAL}" />
    <circle cx="52" cy="88" r="14" fill="{COLOR_DEEP_TEAL}" />
    <circle cx="88" cy="88" r="14" fill="{COLOR_DEEP_TEAL}" />
  </g>
</svg>'''
    filepath = os.path.join(public_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"Saved {filepath}")

def generate_perfect_icon_svg(filename):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" fill="none">
  <g transform="translate(10, 10)">
    <!-- Row 1 -->
    <circle cx="16" cy="16" r="14" fill="{COLOR_TEAL}" />
    <circle cx="52" cy="16" r="14" fill="{COLOR_TEAL}" />
    <circle cx="88" cy="16" r="14" fill="{COLOR_GOLD}" />
    
    <!-- Row 2 -->
    <circle cx="16" cy="52" r="14" fill="{COLOR_TEAL}" />
    <circle cx="52" cy="52" r="14" fill="{COLOR_TEAL}" />
    <circle cx="88" cy="52" r="14" fill="{COLOR_TEAL}" />
    
    <!-- Row 3 -->
    <circle cx="16" cy="88" r="14" fill="{COLOR_DEEP_TEAL}" />
    <circle cx="52" cy="88" r="14" fill="{COLOR_DEEP_TEAL}" />
    <circle cx="88" cy="88" r="14" fill="{COLOR_DEEP_TEAL}" />
  </g>
</svg>'''
    filepath = os.path.join(public_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"Saved {filepath}")

# Write SVGs
generate_perfect_svg(COLOR_CHARCOAL, "logo.svg")
generate_perfect_svg(COLOR_WHITE, "logo-white.svg")
generate_perfect_icon_svg("icon.svg")

# Render ultra high resolution PNGs using PIL with precise math
def draw_png_logo(text_color_hex, output_path):
    scale = 3
    w, h = 680 * scale, 160 * scale
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    font_bold = None
    font_sub = None
    font_candidates = ["arialbd.ttf", "arial.ttf", "calibri.ttf", "Segoe UI Bold.ttf", "DejaVuSans-Bold.ttf"]
    for f in font_candidates:
        try:
            font_bold = ImageFont.truetype(f, 68 * scale)
            font_sub = ImageFont.truetype(f, 24 * scale)
            break
        except Exception:
            pass
            
    if not font_bold:
        font_bold = ImageFont.load_default()
        font_sub = ImageFont.load_default()

    # Draw ECOMATRIX
    draw.text((20 * scale, 25 * scale), "ECOMATRIX", fill=text_color_hex, font=font_bold)
    
    # Draw E N G I N E E R I N G
    subtext = "E N G I N E E R I N G"
    draw.text((23 * scale, 105 * scale), subtext, fill=text_color_hex, font=font_sub)

    # Draw 3x3 Grid Icon
    icon_x = 525 * scale
    icon_y = 25 * scale
    r = 14 * scale
    gap = 36 * scale
    
    dots_color = [
        [COLOR_TEAL, COLOR_TEAL, COLOR_GOLD],
        [COLOR_TEAL, COLOR_TEAL, COLOR_TEAL],
        [COLOR_DEEP_TEAL, COLOR_DEEP_TEAL, COLOR_DEEP_TEAL]
    ]

    for row in range(3):
        for col in range(3):
            cx = icon_x + 16 * scale + col * gap
            cy = icon_y + 16 * scale + row * gap
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dots_color[row][col])

    img.save(output_path, "PNG")
    print(f"Saved PNG {output_path}")

def draw_png_icon(output_path, size=512):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    margin = size * 0.12
    grid_w = size - 2 * margin
    gap = grid_w / 2
    r = grid_w / 6.2
    
    dots_color = [
        [COLOR_TEAL, COLOR_TEAL, COLOR_GOLD],
        [COLOR_TEAL, COLOR_TEAL, COLOR_TEAL],
        [COLOR_DEEP_TEAL, COLOR_DEEP_TEAL, COLOR_DEEP_TEAL]
    ]

    for row in range(3):
        for col in range(3):
            cx = margin + col * gap
            cy = margin + row * gap
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dots_color[row][col])

    img.save(output_path, "PNG")
    print(f"Saved Icon PNG {output_path}")

draw_png_logo(COLOR_CHARCOAL, os.path.join(public_dir, "logo.png"))
draw_png_logo(COLOR_WHITE, os.path.join(public_dir, "logo-white.png"))
draw_png_icon(os.path.join(public_dir, "icon.png"), 512)
draw_png_icon(os.path.join(public_dir, "favicon.png"), 64)
draw_png_icon(os.path.join(app_dir, "icon.png"), 512)
draw_png_icon(os.path.join(app_dir, "apple-icon.png"), 512)

ico_img = Image.open(os.path.join(public_dir, "favicon.png"))
ico_img.save(os.path.join(public_dir, "favicon.ico"), format="ICO", sizes=[(16,16), (32,32), (48,48), (64,64)])
ico_img.save(os.path.join(app_dir, "favicon.ico"), format="ICO", sizes=[(16,16), (32,32), (48,48), (64,64)])
print("All assets updated flawlessly!")
