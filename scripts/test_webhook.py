import requests
import os

# Configuration
URL = "http://127.0.0.1:8000/webhooks/ingest"
***REMOVED***
***REMOVED*** # Known valid email from previous steps

def test_webhook():
    print(f"Testing webhook at {URL}...")
    
    # Create dummy files
    with open("test_audio.mp3", "wb") as f:
        f.write(b"fake audio content")
    
    files = [
        ('files', ('test_audio.mp3', open('test_audio.mp3', 'rb'), 'audio/mpeg')),
    ]
    
    data = {
        "student_email": EMAIL,
        "title": "Test Lesson from Script",
        "date": "2024-02-09"
    }
    
    headers = {
        "x-webhook-secret": SECRET
    }
    
    try:
        response = requests.post(URL, data=data, files=files, headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Request failed: {e}")
    finally:
        # Cleanup
        if os.path.exists("test_audio.mp3"):
            os.remove("test_audio.mp3")

if __name__ == "__main__":
    test_webhook()
