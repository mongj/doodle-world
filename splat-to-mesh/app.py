import logging
import os
import subprocess
import tempfile

import uvicorn
from converter import convert_ply_to_glb, download_file
from fastapi import FastAPI, HTTPException, Query
from gcs_handler import get_public_url, upload_to_gcs
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="SPZ to GLB Converter Service")

# Environment variables
GCS_BUCKET = "doodle-world-static"


class ConversionResponse(BaseModel):
    glb_url: str
    message: str


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.get("/convert", response_model=ConversionResponse)
async def convert_ply_to_glb_endpoint(url: str = Query(..., description="URL of the PLY file to convert")):
    """
    Convert PLY file to GLB mesh.
    
    Process:
    1. Download PLY file from URL
    2. Convert PLY to GLB using PDAL
    3. Upload GLB to GCS
    4. Return public URL
    
    Args:
        url: URL of the PLY file to download and convert
    """
    temp_dir = None
    
    try:
        # Create temporary directory for processing
        temp_dir = tempfile.mkdtemp()
        logger.info(f"Created temp directory: {temp_dir}")
        
        # Define file paths
        ply_path = os.path.join(temp_dir, "input.ply")
        glb_path = os.path.join(temp_dir, "output.glb")
        
        # Step 1: Download PLY file
        logger.info(f"Downloading PLY from: {url}")
        download_file(url, ply_path)
        
        # Step 2: Convert PLY to GLB using PDAL
        logger.info("Converting PLY to GLB...")
        convert_ply_to_glb(ply_path, glb_path)
        
        # Step 3: Upload GLB to GCS
        logger.info("Uploading GLB to GCS...")
        # Generate a unique filename based on timestamp
        from datetime import datetime
        filename = f"converted_{datetime.now().strftime('%Y%m%d_%H%M%S')}.glb"
        blob_name = f"conversions/{filename}"
        
        upload_to_gcs(GCS_BUCKET, glb_path, blob_name)
        
        # Step 4: Get public URL
        glb_url = get_public_url(GCS_BUCKET, blob_name)
        logger.info(f"Conversion successful. GLB URL: {glb_url}")
        
        return ConversionResponse(
            glb_url=glb_url,
            message="Conversion successful"
        )
        
    except subprocess.CalledProcessError as e:
        logger.error(f"Subprocess error: {e.stderr}")
        raise HTTPException(
            status_code=500,
            detail=f"Conversion failed: {e.stderr}"
        )
    except Exception as e:
        logger.error(f"Error during conversion: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred: {str(e)}"
        )
    finally:
        # Cleanup temporary files
        if temp_dir and os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir)
            logger.info(f"Cleaned up temp directory: {temp_dir}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)

