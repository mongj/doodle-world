import logging
import os

from google.cloud import storage

logger = logging.getLogger(__name__)


def upload_to_gcs(bucket_name: str, source_file_path: str, destination_blob_name: str) -> None:
    """
    Upload a file to Google Cloud Storage.
    
    Args:
        bucket_name: Name of the GCS bucket
        source_file_path: Local path to the file to upload
        destination_blob_name: Destination path in the bucket
    """
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(destination_blob_name)
        
        # Upload the file
        blob.upload_from_filename(source_file_path)
        
        # Make the blob publicly accessible (optional)
        blob.make_public()
        
        logger.info(f"File {source_file_path} uploaded to {destination_blob_name}")
        
    except Exception as e:
        logger.error(f"Failed to upload to GCS: {e}")
        raise Exception(f"GCS upload failed: {e}")


def get_public_url(bucket_name: str, blob_name: str) -> str:
    """
    Get the public URL for a blob in GCS.
    
    Args:
        bucket_name: Name of the GCS bucket
        blob_name: Name of the blob in the bucket
        
    Returns:
        Public URL of the blob
    """
    return f"https://storage.googleapis.com/{bucket_name}/{blob_name}"

