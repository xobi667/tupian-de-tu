import httpx
import asyncio
import json

BASE_URL = "http://localhost:8001" # Assume local dev server

async def test_chat_interaction():
    # 1. Mock a job id (manually check one from logs or use a dummy)
    # Since BATCH_JOBS is in-memory, we might need to upload first or just test the logic
    # Let's try to test the /api/chat endpoint directly with a fake job_id
    
    chat_payload = {
        "message": "根据表格需求去修改主图",
        "job_id": "dummy_test_job",
        "history": []
    }
    
    headers = {"Content-Type": "application/json"}
    
    print("--- User: 根据表格需求去修改主图 ---")
    async with httpx.AsyncClient() as client:
        # Note: This will likely fail if dummy_test_job isn't in BATCH_JOBS, 
        # but it will test if AI asks to upload a file first, which is correct.
        resp = await client.post(f"{BASE_URL}/api/chat/", json=chat_payload)
        data = resp.json()
        print(f"AI: {data['response']}")
        
        # Test confirmation logic
        chat_payload["message"] = "可以，开始吧"
        chat_payload["history"].append({"role": "user", "parts": [{"text": "根据表格需求去修改主图"}]})
        chat_payload["history"].append({"role": "model", "parts": [{"text": data['response']}]})
        
        print("\n--- User: 可以，开始吧 ---")
        resp = await client.post(f"{BASE_URL}/api/chat/", json=chat_payload)
        data = resp.json()
        print(f"AI: {data['response']}")
        print(f"Action: {data.get('action')}")

if __name__ == "__main__":
    try:
        asyncio.run(test_chat_interaction())
    except Exception as e:
        print(f"Test failed (server might not be running): {e}")
