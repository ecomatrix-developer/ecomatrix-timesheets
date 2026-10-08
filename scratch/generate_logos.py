import os
import math
from PIL import Image, ImageDraw, ImageFont

# Directory setup
public_dir = r"c:\Users\abeer\OneDrive\Desktop\Eco matrix Solutions\Deployed Code\Timesheet_Recoder SirVersion\v2-nextjs\public"
app_dir = r"c:\Users\abeer\OneDrive\Desktop\Eco matrix Solutions\Deployed Code\Timesheet_Recoder SirVersion\v2-nextjs\src\app"

os.makedirs(public_dir, exist_ok=True)
os.makedirs(app_dir, exist_ok=True)

# Brand Colors from eco-matrix-logo.jpeg palette
COLOR_PRIMARY_TEAL = "#295F5A"  # Deep Teal
COLOR_TEAL = "#357F79"          # Secondary Teal
COLOR_GOLD = "#D4A017"          # Gold Yellow Accent
COLOR_CHARCOAL = "#20211D"      # Dark Text
COLOR_WHITE = "#FFFFFF"         # Light/Dark background text

def create_svg_logo(text_color=COLOR_CHARCOAL, filename="logo.svg"):
    """
    Creates SVG for EcoMatrix Engineering logo with transparent background.
    """
    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 120" width="520" height="120" fill="none">
  <g transform="translate(10, 15)">
    <!-- Text Group: ECOMATRIX -->
    <text x="0" y="52" font-family="System-UI, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="52" fill="{text_color}" letter-spacing="1.5">ECOMATRIX</text>
    <!-- Text Group: ENGINEERING (spaced out to align) -->
    <text x="2" y="82" font-family="System-UI, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="500" font-size="19" fill="{text_color}" letter-spacing="10.8">ENGINEERING</text>
  </g>
  
  <!-- Dot Matrix Icon Group (3x3 Grid) -->
  <g transform="translate(425, 22)">
    <!-- Row 1 -->
    <circle cx="12" cy="12" r="10" fill="{COLOR_TEAL}" />
    <circle cx="38" cy="12" r="10" fill="{COLOR_TEAL}" />
    <circle cx="64" cy="12" r="10" fill="{COLOR_GOLD}" />
    
    <!-- Row 2 -->
    <circle cx="12" cy="38" r="10" fill="{COLOR_TEAL}" />
    <circle cx="38" cy="38" r="10" fill="{COLOR_TEAL}" />
    <circle cx="64" cy="38" r="10" fill="{COLOR_TEAL}" />
    
    <!-- Row 3 -->
    <circle cx="12" cy="64" r="10" fill="{COLOR_PRIMARY_TEAL}" />
    <circle cx="38" cy="64" r="10" fill="{COLOR_PRIMARY_TEAL}" />
    <circle cx="64" cy="64" r="10" fill="{COLOR_PRIMARY_TEAL}" />
  </g>
</svg>'''
    filepath = os.path.join(public_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(svg_content)
    print(f"Generated {filepath}")

def create_svg_icon(filename="icon.svg"):
    """
    Creates standalone 3x3 Dot Matrix icon SVG.
    """
    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" fill="none">
  <g transform="translate(12, 12)">
    <!-- Row 1 -->
    <circle cx="12" cy="12" r="11" fill="{COLOR_TEAL}" />
    <circle cx="38" cy="12" r="11" fill="{COLOR_TEAL}" />
    <circle cx="64" cy="12" r="11" fill="{COLOR_GOLD}" />
    
    <!-- Row 2 -->
    <circle cx="12" cy="38" r="11" fill="{COLOR_TEAL}" />
    <circle cx="38" cy="38" r="11" fill="{COLOR_TEAL}" />
    <circle cx="64" cy="38" r="11" fill="{COLOR_TEAL}" />
    
    <!-- Row 3 -->
    <circle cx="12" cy="64" r="11" fill="{COLOR_PRIMARY_TEAL}" />
    <circle cx="38" cy="64" r="11" fill="{COLOR_PRIMARY_TEAL}" />
    <circle cx="64" cy="64" r="11" fill="{COLOR_PRIMARY_TEAL}" />
  </g>
</svg>'''
    filepath = os.path.join(public_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(svg_content)
    print(f"Generated {filepath}")

# Create SVGs
create_svg_logo(COLOR_CHARCOAL, "logo.svg")
create_svg_logo(COLOR_WHITE, "logo-white.svg")
create_svg_icon("icon.svg")

# Also render crisp high-res transparent PNGs using PIL
def render_png_logo(text_color_hex, output_path, scale=2):
    width, height = 1040 * scale, 240 * scale
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Try loading bold system font or fallback
    font_bold = None
    font_sub = None
    font_names = ["arialbd.ttf", "arial.ttf", "calibri.ttf", "Segoe UI Bold.ttf", "DejaVuSans-Bold.ttf"]
    for font_name in font_names:
        try:
            font_bold = ImageFont.truetype(font_name, 96 * scale)
            font_sub = ImageFont.truetype(font_name, 34 * scale)
            break
        except Exception:
            pass
            
    if font_bold is None:
        font_bold = ImageFont.load_default()
        font_sub = ImageFont.load_default()

    # Draw Text "ECOMATRIX"
    text1 = "ECOMATRIX"
    draw.text((20 * scale, 30 * scale), text1, fill=text_color_hex, font=font_bold)

    # Draw Subtext "E N G I N E E R I N G"
    subtext = "E N G I N E E R I N G"
    draw.text((24 * scale, 150 * scale), subtext, fill=text_color_hex, font=font_sub)

    # Draw 3x3 Matrix Icon
    matrix_x_offset = 830 * scale
    matrix_y_offset = 40 * scale
    dot_radius = 20 * scale
    gap = 52 * scale

    colors = [
        [COLOR_TEAL, COLOR_TEAL, COLOR_GOLD],
        [COLOR_TEAL, COLOR_TEAL, COLOR_TEAL],
        [COLOR_PRIMARY_TEAL, COLOR_PRIMARY_TEAL, COLOR_PRIMARY_TEAL]
    ]

    for r in range(3):
        for c in range(3):
            cx = matrix_x_offset + c * gap
            cy = matrix_y_offset + r * gap
            draw.ellipse([cx - dot_radius, cy - dot_radius, cx + dot_radius, cy + dot_radius], fill=colors[r][c])

    img.save(output_path, "PNG")
    print(f"Generated PNG: {output_path}")

def render_png_icon(output_path, size=512):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = size * 0.15
    grid_size = size - 2 * margin
    gap = grid_size / 2
    dot_radius = grid_size / 6.5

    colors = [
        [COLOR_TEAL, COLOR_TEAL, COLOR_GOLD],
        [COLOR_TEAL, COLOR_TEAL, COLOR_TEAL],
        [COLOR_PRIMARY_TEAL, COLOR_PRIMARY_TEAL, COLOR_PRIMARY_TEAL]
    ]

    for r in range(3):
        for c in range(3):
            cx = margin + c * gap
            cy = margin + r * gap
            draw.ellipse([cx - dot_radius, cy - dot_radius, cx + dot_radius, cy + dot_radius], fill=colors[r][c])

    img.save(output_path, "PNG")
    print(f"Generated Icon PNG: {output_path}")

render_png_logo(COLOR_CHARCOAL, os.path.join(public_dir, "logo.png"))
render_png_logo(COLOR_WHITE, os.path.join(public_dir, "logo-white.png"))
render_png_icon(os.path.join(public_dir, "icon.png"), 512)
render_png_icon(os.path.join(public_dir, "favicon.png"), 64)
render_png_icon(os.path.join(app_dir, "icon.png"), 512)
render_png_icon(os.path.join(app_dir, "apple-icon.png"), 512)

# Save ICO for favicon.ico
ico_img = Image.open(os.path.join(public_dir, "favicon.png"))
ico_img.save(os.path.join(public_dir, "favicon.ico"), format="ICO", sizes=[(32, 32), (48, 48), (64, 64)])
ico_img.save(os.path.join(app_dir, "favicon.ico"), format="ICO", sizes=[(32, 32), (48, 48), (64, 64)])
print("Generated favicon.ico in public and app")
