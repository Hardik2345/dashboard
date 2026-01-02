import urllib.request
import json
import time

url = "http://localhost:3000/webhooks/qstash"
data = {"type": "test", "message": "hello python"}
headers = {
    "Content-Type": "application/json",
    "upstash-signature": "fake_signature_for_testing"
}

encoded_data = json.dumps(data).encode('utf-8')
req = urllib.request.Request(url, data=encoded_data, headers=headers)

max_retries = 5
for i in range(max_retries):
    try:
        with urllib.request.urlopen(req) as response:
            print(f"Status: {response.getcode()}")
            print(response.read().decode('utf-8'))
        break
    except urllib.error.URLError as e:
        print(f"Attempt {i+1} failed: {e}")
        time.sleep(2)
