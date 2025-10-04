import json
import logging
import subprocess
import tempfile

import requests

logger = logging.getLogger(__name__)


def download_file(url: str, output_path: str) -> None:
    """
    Download a file from a URL to local path.
    
    Args:
        url: The URL to download from
        output_path: Local path to save the file
    """
    response = requests.get(url, stream=True)
    response.raise_for_status()
    
    with open(output_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    
    logger.info(f"Downloaded file to: {output_path}")


def convert_ply_to_glb(input_ply_path: str, output_glb_path: str) -> None:
    """
    Converts a .ply point cloud file to a .glb mesh file using PDAL CLI.
    
    This function is based on the working conversion code from the notebook.
    Uses PDAL command-line tool to avoid Python binding compilation issues.
    
    Args:
        input_ply_path: The file path for the input .ply file
        output_glb_path: The file path for the output .glb file
    
    Raises:
        Exception: If the conversion fails
    """
    logger.info(f"Starting conversion from {input_ply_path} to {output_glb_path}...")

    # Define the PDAL pipeline to read PLY, create a mesh, and write GLB
    # Try filters.delaunay instead of greedyprojection (more stable)
    pipeline_definition = {
        "pipeline": [
            {
                "type": "readers.ply",
                "filename": input_ply_path
            },
            {
                "type": "filters.delaunay"
            },
            {
                "type": "writers.gltf",
                "filename": output_glb_path
            }
        ]
    }

    try:
        # Write pipeline to temporary JSON file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(pipeline_definition, f)
            pipeline_file = f.name
        
        logger.info(f"Pipeline definition: {json.dumps(pipeline_definition, indent=2)}")
        
        # Execute PDAL pipeline using CLI
        result = subprocess.run(
            ["pdal", "pipeline", pipeline_file],
            capture_output=True,
            text=True,
            check=True
        )
        
        logger.info(f"Successfully converted file.")
        logger.info(f"PDAL output: {result.stdout}")
        logger.info(f"Output saved to: {output_glb_path}")

    except subprocess.CalledProcessError as e:
        logger.error(f"PDAL command failed: {e}")
        raise Exception(f"PDAL conversion failed: {e}")
    except Exception as e:
        logger.error(f"An error occurred during the conversion: {e}")
        raise Exception(f"PDAL conversion failed: {e}")
    finally:
        # Clean up temporary pipeline file
        import os
        if 'pipeline_file' in locals() and os.path.exists(pipeline_file):
            os.unlink(pipeline_file)

