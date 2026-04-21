#!/usr/bin/env python3
"""
Create a PERFECTLY CENTERED CV app icon matching the splash screen style
"""
from PIL import Image, ImageDraw, ImageFont
import os

def create_perfect_cv_icon(size, output_path):
    """Create a CV icon with PERFECT centering matching the splash screen"""
    
    # Gold background color (matching the splash screen)
    gold_color = (200, 136, 10)  # #C8880A - exact gold from the app
    white_color = (255, 255, 255)
    
    # Create image with gold background
    img = Image.new('RGB', (size, size), gold_color)
    draw = ImageDraw.Draw(img)
    
    # Calculate font size - 45% of image size for bold CV text
    font_size = int(size * 0.45)
    
    # Try to load a bold font
    font = None
    font_paths = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf', 
        '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    ]
    
    for fp in font_paths:
        if os.path.exists(fp):
            font = ImageFont.truetype(fp, font_size)
            print(f"Using font: {fp}")
            break
    
    if font is None:
        print("WARNING: Using default font")
        font = ImageFont.load_default()
    
    text = "CV"
    
    # Get text bounding box for PERFECT centering
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # Calculate EXACT center position
    x = (size - text_width) // 2 - bbox[0]
    y = (size - text_height) // 2 - bbox[1]
    
    print(f"Size: {size}, Text size: {text_width}x{text_height}")
    print(f"Position: ({x}, {y})")
    
    # Draw the text at the calculated center position
    draw.text((x, y), text, font=font, fill=white_color)
    
    # Save the image
    img.save(output_path, 'PNG', optimize=True)
    print(f"✅ Created: {output_path}")
    return True

def main():
    base_path = '/app/frontend/assets/images'
    playstore_path = '/app/frontend/assets/playstore'
    
    # Ensure directories exist
    os.makedirs(base_path, exist_ok=True)
    os.makedirs(playstore_path, exist_ok=True)
    
    # Create all required icon sizes
    icons_to_create = [
        (1024, f'{base_path}/icon.png'),
        (1024, f'{base_path}/adaptive-icon.png'),
        (512, f'{playstore_path}/app_icon_512.png'),
        (512, f'{playstore_path}/clubvel_icon_512.png'),
    ]
    
    for size, path in icons_to_create:
        create_perfect_cv_icon(size, path)
    
    print("\n🎨 All icons created with PERFECTLY CENTERED 'CV'!")
    print("The icons now match the beautiful splash screen design!")

if __name__ == '__main__':
    main()
