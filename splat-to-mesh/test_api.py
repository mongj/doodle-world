#!/usr/bin/env python3
"""
Simple test script for the SPZ to GLB converter API
"""
import json
import sys

import requests


def test_health_check(base_url: str = "http://localhost:8000"):
    """Test the health check endpoint"""
    print("🔍 Testing health check endpoint...")
    try:
        response = requests.get(f"{base_url}/health")
        response.raise_for_status()
        print("✅ Health check passed:", response.json())
        return True
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False


def test_conversion(base_url: str = "http://localhost:8000", ply_url: str = None):
    """Test the conversion endpoint"""
    if not ply_url:
        print("⚠️  No PLY URL provided. Skipping conversion test.")
        print("   Usage: python test_api.py <ply_url>")
        return False
    
    print(f"🔍 Testing conversion endpoint with URL: {ply_url}")
    try:
        response = requests.get(
            f"{base_url}/convert",
            params={"url": ply_url},
            timeout=300  # 5 minutes timeout for conversion
        )
        response.raise_for_status()
        result = response.json()
        print("✅ Conversion successful!")
        print(f"   GLB URL: {result['glb_url']}")
        print(f"   Message: {result['message']}")
        return True
    except requests.exceptions.Timeout:
        print("❌ Conversion timed out (took longer than 5 minutes)")
        return False
    except requests.exceptions.HTTPError as e:
        print(f"❌ Conversion failed with HTTP error: {e}")
        if hasattr(e.response, 'text'):
            print(f"   Response: {e.response.text}")
        return False
    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        return False


if __name__ == "__main__":
    print("🚀 SPZ to GLB Converter API Test Suite\n")
    
    base_url = "http://localhost:8000"
    
    # Test health check
    health_ok = test_health_check(base_url)
    print()
    
    if not health_ok:
        print("❌ Service is not healthy. Make sure the service is running.")
        print("   Run: docker-compose up")
        sys.exit(1)
    
    # Test conversion if URL provided
    if len(sys.argv) > 1:
        ply_url = sys.argv[1]
        conversion_ok = test_conversion(base_url, ply_url)
        print()
        
        if conversion_ok:
            print("✅ All tests passed!")
            sys.exit(0)
        else:
            print("❌ Conversion test failed")
            sys.exit(1)
    else:
        print("✅ Health check passed!")
        print("\n💡 To test conversion, provide a PLY URL:")
        print("   python test_api.py https://example.com/file.ply")
        sys.exit(0)

