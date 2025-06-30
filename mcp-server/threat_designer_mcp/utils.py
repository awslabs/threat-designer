import os
from PIL import Image
import imghdr

def validate_image(file_path):
    """
    Validates that an image meets the required criteria.
    
    Args:
        file_path (str): Absolute path to the image file
        
    Returns:
        tuple: (img_type, width, height) if valid
        
    Raises:
        FileNotFoundError: If the file doesn't exist
        ValueError: If the file is not PNG/JPEG, exceeds size limits, or is too large
    """
    # Check if file exists
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    # Check file size (3.75 MB = 3.75 * 1024 * 1024 bytes)
    max_size_bytes = 3.75 * 1024 * 1024
    file_size = os.path.getsize(file_path)
    if file_size > max_size_bytes:
        size_mb = file_size / (1024 * 1024)
        raise ValueError(f"File size ({size_mb:.2f} MB) exceeds maximum allowed size (3.75 MB)")
    
    # Check file type
    img_type = imghdr.what(file_path)
    if img_type not in ['png', 'jpeg']:
        raise ValueError(f"Unsupported image format: {img_type}. Only PNG and JPEG are supported")
    
    # Check image dimensions
    with Image.open(file_path) as img:
        width, height = img.size
        if width > 8000 or height > 8000:
            raise ValueError(f"Image dimensions ({width}x{height}) exceed maximum allowed dimensions (8000x8000)")
    
    return img_type, width, height
