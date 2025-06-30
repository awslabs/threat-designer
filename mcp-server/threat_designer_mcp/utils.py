import os
from PIL import Image
import imghdr
from typing import List, Dict, Any

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


def count_threats_by_likelihood(threat_model_data):
    """
    Count the number of threats by their likelihood in the provided threat model data.
    
    Args:
        threat_model_data (dict): The threat model data structure
        
    Returns:
        dict: A dictionary with likelihood as keys and counts as values
    """
    # Initialize counters for common likelihood levels
    likelihood_counts = {
        "Low": 0,
        "Medium": 0,
        "High": 0
    }
    
    # Extract threats from the threat model data
    if "threat_list" in threat_model_data and "threats" in threat_model_data["threat_list"]:
        threats = threat_model_data["threat_list"]["threats"]
        
        # Count threats by likelihood
        for threat in threats:
            if "likelihood" in threat:
                likelihood = threat["likelihood"]
                # Update existing likelihood or add new one
                if likelihood in likelihood_counts:
                    likelihood_counts[likelihood] += 1
                else:
                    likelihood_counts[likelihood] = 1
    
    # Remove any likelihood categories with zero count
    return {k: v for k, v in likelihood_counts.items() if v > 0}


def transform_threat_models(threat_models: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Transform threat models to the desired output format with likelihood summary.
    
    Args:
        threat_models (list): List of threat model dictionaries
        
    Returns:
        list: Transformed list with specified fields
    """
    transformed_list = []
    
    for model in threat_models:
        # Create the transformed model with only the requested fields
        transformed_model = {
            "threat_model_id": model.get("job_id", ""),
            "likelihood_summary": count_threats_by_likelihood(model),
            "title": model.get("title", "Untitled")
        }
        
        transformed_list.append(transformed_model)
        
    return transformed_list
