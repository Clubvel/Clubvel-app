#!/usr/bin/env python3
"""
Create a PERFECTLY CENTERED CV app icon
"""
from PIL import Image, ImageDraw, ImageFont
import os

def create_centered_cv_icon(size, output_path):
    """Create a CV icon with PERFECT mathematical centering"""
    
    # Gold/amber background color
    gold_color = (212, 165, 40)  # #D4A528
    white_color = (255, 255, 255)
    
    # Create image with gold background
    img = Image.new('RGB', (size, size), gold_color)
    draw = ImageDraw.Draw(img)
    
    # Try to load a bold font, fall back to default
    font_size = int(size * 0.42)  # 42% of image size for the text
    
    try:
        # Try different font paths
        font_paths = [
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
        ]
        font = None
        for fp in font_paths:
            if os.path.exists(fp):
                font = ImageFont.truetype(fp, font_size)
                break
        if font is None:
            # Use default font
            font = ImageFont.load_default()
            font_size = 40  # Default font is small
    except Exception as e:
        print(f"Font loading error: {e}")
        font = ImageFont.load_default()
    
    text = "CV"
    
    # Get text bounding box for PERFECT centering
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # Calculate EXACT center position
    x = (size - text_width) // 2 - bbox[0]
    y = (size - text_height) // 2 - bbox[1]
    
    # Draw the text at the calculated center position
    draw.text((x, y), text, font=font, fill=white_color)
    
    # Save the image
    img.save(output_path, 'PNG')
    print(f"Created: {output_path} ({size}x{size})")
    return True

def main():
    base_path = '/app/frontend/assets/images'
    playstore_path = '/app/frontend/assets/playstore'
    
    # Create all required icon sizes
    icons_to_create = [
        (1024, f'{base_path}/icon.png'),           # Main app icon
        (1024, f'{base_path}/adaptive-icon.png'),  # Android adaptive icon
        (512, f'{playstore_path}/app_icon_512.png'),
        (512, f'{playstore_path}/clubvel_icon_512.png'),
    ]
    
    for size, path in icons_to_create:
        create_centered_cv_icon(size, path)
    
    print("\n✅ All icons created with PERFECTLY CENTERED 'CV'!")

if __name__ == '__main__':
    main()
