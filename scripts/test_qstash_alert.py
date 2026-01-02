import urllib.request
import json
import time

url = "http://localhost:3000/webhooks/qstash"
# Sending a random brand_id that likely doesn't exist or isn't configured, 
# just to verify we reach the alerts controller logic.
data = {"brand_id": 999999, "metric_name": "test_metric", "value": 100}
headers = {
    "Content-Type": "application/json",
    "upstash-signature": "fake_sig"
}

encoded_data = json.dumps(data).encode('utf-8')
req = urllib.request.Request(url, data=encoded_data, headers=headers)

try:
    with urllib.request.urlopen(req) as response:
        print(f"Status: {response.getcode()}")
        print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
