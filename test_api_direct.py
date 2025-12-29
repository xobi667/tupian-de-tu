"""
直接测试 Yunwu API 调用
"""
import httpx
import base64
import json
import asyncio
import os

# 配置
YUNWU_BASE_URL = "https://yunwu.ai"
GEMINI_FLASH_API_KEY = "sk-Oc94mUXKNLZ3irBvvna8mffp9rkt07EQnlr5PuIMzi06BDYw"
GEMINI_FLASH_MODEL = "gemini-3-flash-preview"

async def test_text_api():
    """测试纯文本 API"""
    print("=" * 50)
    print("测试 1: 纯文本调用")
    print("=" * 50)
    
    url = f"{YUNWU_BASE_URL}/v1beta/models/{GEMINI_FLASH_MODEL}:generateContent"
    
    headers = {
        "Authorization": f"Bearer {GEMINI_FLASH_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": "Say hello in Chinese, just one word."}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.7
        }
    }
    
    print(f"URL: {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, headers=headers, json=payload)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("Response:", json.dumps(result, indent=2, ensure_ascii=False)[:1000])
            return True
        else:
            print("Error:", response.text[:500])
            return False


async def test_vision_api():
    """测试图片分析 API (Vision)"""
    print("\n" + "=" * 50)
    print("测试 2: 图片分析 (Vision)")
    print("=" * 50)
    
    image_path = r"e:\xobi666\image.png"
    
    if not os.path.exists(image_path):
        print(f"图片不存在: {image_path}")
        return False
    
    # 读取图片
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")
    
    print(f"图片大小: {len(image_data)} bytes (base64)")
    
    url = f"{YUNWU_BASE_URL}/v1beta/models/{GEMINI_FLASH_MODEL}:generateContent"
    
    headers = {
        "Authorization": f"Bearer {GEMINI_FLASH_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "inlineData": {
                            "mimeType": "image/png",
                            "data": image_data
                        }
                    },
                    {"text": "What product is shown in this image? Reply in one sentence."}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 500
        }
    }
    
    print(f"URL: {url}")
    print("Sending request with image...")
    
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(url, headers=headers, json=payload)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("Response:", json.dumps(result, indent=2, ensure_ascii=False)[:2000])
            return True
        else:
            print("Error:", response.text[:1000])
            return False


async def main():
    print("Yunwu API 直接测试\n")
    
    # 测试 1: 纯文本
    text_ok = await test_text_api()
    
    # 测试 2: 图片分析
    vision_ok = await test_vision_api()
    
    print("\n" + "=" * 50)
    print("测试结果")
    print("=" * 50)
    print(f"纯文本 API: {'✓ 成功' if text_ok else '✗ 失败'}")
    print(f"图片分析 API: {'✓ 成功' if vision_ok else '✗ 失败'}")


if __name__ == "__main__":
    asyncio.run(main())
