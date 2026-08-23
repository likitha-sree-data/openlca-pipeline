import json
import urllib.request

payload = json.dumps({
    "jsonrpc": "2.0",
    "id": 1,
    "method": "data/get/descriptors",
    "params": {"@type": "ProductSystem"}
}).encode()

req = urllib.request.Request(
    "http://localhost:8080",
    data=payload,
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(req) as resp:
    data = json.load(resp)

for item in data["result"]:
    print(item["name"], "->", item["@id"])
