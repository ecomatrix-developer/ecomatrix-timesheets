import os
from PIL import Image, ImageChops

gen_image_path = r"C:\Users\abeer\.gemini\antigravity-ide\brain\436fb4e0-820b-4a90-bdb6-4854e68f8bff\eco_matrix_logo_enhanced_1791356817317.jpg"
public_dir = r"c:\Users\abeer\OneDrive\Desktop\Eco matrix Solutions\Deployed Code\Timesheet_Recoder SirVersion\v2-nextjs\public"
app_dir = r"c:\Users\abeer\OneDrive\Desktop\Eco matrix Solutions\Deployed Code\Timesheet_Recoder SirVersion\v2-nextjs\src\app"

img = Image.open(gen_image_path).convert("RGBA")
width, height = img.size

# Step 1: Make white/light background transparent
# Inspect pixels and map light background to transparent
datas = img.getdata()

new_data_dark_text = []
new_data_white_text = []
icon_crop_mask = []

for item in datas:
    r, g, b, a = item
    # Calculate luminance/brightness
    brightness = (r * 299 + g * 587 + b * 114) / 1000
    
    if brightness > 235 and abs(r - g) < 20 and abs(g - b) < 20: # Background (white/off-white)
        new_data_dark_text.append((0, 0, 0, 0))
        new_data_white_text.append((0, 0, 0, 0))
    else:
        # Check if pixel is dark text (low brightness, grayscale/charcoal)
        if brightness < 100 and max(r, g, b) - min(r, g, b) < 30:
            new_data_dark_text.append((32, 33, 29, 255))      # #20211D Charcoal
            new_data_white_text.append((255, 255, 255, 255))  # Pure White
        else:
            # It's part of the teal/gold dot matrix! Keep original colors
            new_data_dark_text.append((r, g, b, 255))
            new_data_white_text.append((r, g, b, 255))

transparent_dark = Image.new("RGBA", (width, height))
transparent_dark.putdata(new_data_dark_text)

transparent_white = Image.new("RGBA", (width, height))
transparent_white.putdata(new_data_white_text)

# Find bounding box of non-transparent content to crop tightly
bbox_dark = transparent_dark.getbbox()
print("Dark BBox:", bbox_dark)

if bbox_dark:
    # Add small padding around bounding box
    pad = 15
    left = max(0, bbox_dark[0] - pad)
    top = max(0, bbox_dark[1] - pad)
    right = min(width, bbox_dark[2] + pad)
    bottom = min(height, bbox_dark[3] + pad)
    
    cropped_dark = transparent_dark.crop((left, top, right, bottom))
    cropped_white = transparent_white.crop((left, top, right, bottom))
    
    # Save transparent logo PNGs
    logo_dark_path = os.path.join(public_dir, "logo.png")
    logo_white_path = os.path.join(public_dir, "logo-white.png")
    
    cropped_dark.save(logo_dark_path, "PNG")
    cropped_white.save(logo_white_path, "PNG")
    print(f"Saved {logo_dark_path} and {logo_white_path}")

    # Now let's find the dot matrix icon on the right side of cropped_dark
    # The dot matrix is roughly the rightmost 25% of the logo box
    c_w, c_h = cropped_dark.size
    icon_box_left = int(c_w * 0.72)
    icon_sub_dark = cropped_dark.crop((icon_box_left, 0, c_w, c_h))
    icon_bbox = icon_sub_dark.getbbox()
    if icon_bbox:
        icon_left = icon_box_left + icon_bbox[0]
        icon_top = icon_bbox[1]
        icon_right = icon_box_left + icon_bbox[2]
        icon_bottom = icon_bbox[3]
        
        # Make it square
        i_w = icon_right - icon_left
        i_h = icon_bottom - icon_top
        max_side = max(i_w, i_h) + 10
        center_x = (icon_left + icon_right) // 2
        center_y = (icon_top + icon_bottom) // 2
        
        sq_left = max(0, center_x - max_side // 2)
        sq_top = max(0, center_y - max_side // 2)
        sq_right = min(c_w, center_x + max_side // 2)
        sq_bottom = min(c_h, center_y + max_side // 2)
        
        icon_img = cropped_dark.crop((sq_left, sq_top, sq_right, sq_bottom))
        
        # Resize to high-res standard sizes
        icon_512 = icon_img.resize((512, 512), Image.Resampling.LANCZOS)
        icon_64 = icon_img.resize((64, 64), Image.Resampling.LANCZOS)
        
        icon_512.save(os.path.join(public_dir, "icon.png"), "PNG")
        icon_512.save(os.path.join(app_dir, "icon.png"), "PNG")
        icon_512.save(os.path.join(app_dir, "apple-icon.png"), "PNG")
        
        icon_64.save(os.path.join(public_dir, "favicon.png"), "PNG")
        icon_64.save(os.path.join(public_dir, "favicon.ico"), format="ICO", sizes=[(16,16), (32,32), (48,48), (64,64)])
        icon_64.save(os.path.join(app_dir, "favicon.ico"), format="ICO", sizes=[(16,16), (32,32), (48,48), (64,64)])
        print("Successfully generated high quality transparent icons and favicons!")
