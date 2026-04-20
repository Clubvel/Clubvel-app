#!/usr/bin/env python3
"""
Create a PERFECTLY CENTERED CV app icon with OPTICAL adjustment
The letter "C" has more visual weight on the right, so we shift slightly left
"""
from PIL import Image, ImageDraw, ImageFont
import os

def create_optically_centered_cv_icon(size, output_path):
    """Create a CV icon with OPTICAL centering adjustment"""
    
    # Gold/amber background color
    gold_color = (212, 165, 40)  # #D4A528
    white_color = (255, 255, 255)
    
    # Create image with gold background
    img = Image.new('RGB', (size, size), gold_color)
    draw = ImageDraw.Draw(img)
    
    # Calculate font size - 40% of image size
    font_size = int(size * 0.40)
    
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
    
    # Get text bounding box
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # Calculate center position
    x = (size - text_width) // 2 - bbox[0]
    y = (size - text_height) // 2 - bbox[1]
    
    # OPTICAL ADJUSTMENT: Shift left by 2% of size because "C" opens to the right
    # This makes it LOOK more centered to the human eye
    optical_shift = -int(size * 0.02)
    x += optical_shift
    
    print(f"Size: {size}, Text size: {text_width}x{text_height}")
    print(f"Position: ({x}, {y}) with optical shift: {optical_shift}")
    
    # Draw the text
    draw.text((x, y), text, font=font, fill=white_color)
    
    # Save the image
    img.save(output_path, 'PNG', optimize=True)
    print(f"✅ Created: {output_path}")
    return True

def main():
    base_path = '/app/frontend/assets/images'
    playstore_path = '/app/frontend/assets/playstore'
    
    # Create all required icon sizes
    icons_to_create = [
        (1024, f'{base_path}/icon.png'),
        (1024, f'{base_path}/adaptive-icon.png'),
        (512, f'{playstore_path}/app_icon_512.png'),
        (512, f'{playstore_path}/clubvel_icon_512.png'),
    ]
    
    for size, path in icons_to_create:
        create_optically_centered_cv_icon(size, path)
    
    print("\n🎯 All icons created with OPTICAL CENTERING!")
    print("The CV text is shifted slightly left to compensate for the 'C' letter shape.")

if __name__ == '__main__':
    main()
