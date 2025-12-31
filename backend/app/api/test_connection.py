"""
测试 API 连接 - 验证用户配置的 API Key 是否有效
"""
from fastapi import APIRouter
from pydantic import BaseModel
import httpx
from ..config import config

router = APIRouter(prefix="/api", tags=["Test"])


class TestRequest(BaseModel):
    test_message: str = "测试连接"


class TestResponse(BaseModel):
    success: bool
    message: str


@router.post("/test-connection", response_model=TestResponse)
async def test_api_connection(request: TestRequest):
    """
    测试云雾 API 连接

    此接口会发送一个简单的请求到 Gemini Flash 模型，验证：
    1. API Key 是否有效
    2. 网络连接是否正常
    3. 模型是否可用
    """
    try:
        # 构建测试请求 (使用 OpenAI 兼容格式)
        url = f"{config.get_base_url()}/v1/chat/completions"

        headers = {
            "Authorization": f"Bearer {config.get_api_key('flash')}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": config.get_model('flash'),
            "messages": [{
                "role": "user",
                "content": "Hello, reply with 'OK' if you receive this."
            }],
            "temperature": 0.1,
            "max_tokens": 10
        }

        print(f"[Test] 测试连接到云雾 API: {url}")
        print(f"[Test] 使用模型: {payload['model']}")
        print(f"[Test] 请求体: {payload}")

        # 发送请求（5秒超时）
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(url, headers=headers, json=payload)

            print(f"[Test] 响应状态码: {response.status_code}")
            if response.status_code != 200:
                print(f"[Test] 响应内容: {response.text[:500]}")

            # 检查响应状态
            if response.status_code == 200:
                # API Key 有效，模型可用
                return TestResponse(
                    success=True,
                    message="连接成功！API Key 有效，模型响应正常"
                )
            elif response.status_code == 401:
                return TestResponse(
                    success=False,
                    message="API Key 无效或已过期，请检查后重试"
                )
            elif response.status_code == 403:
                return TestResponse(
                    success=False,
                    message="API Key 权限不足或已被限制"
                )
            elif response.status_code == 429:
                return TestResponse(
                    success=False,
                    message="API 调用频率过高，请稍后重试"
                )
            elif response.status_code == 503:
                return TestResponse(
                    success=False,
                    message="云雾 API 服务暂时不可用（503），请稍后重试"
                )
            else:
                return TestResponse(
                    success=False,
                    message=f"API 返回错误: HTTP {response.status_code}"
                )

    except httpx.TimeoutException:
        return TestResponse(
            success=False,
            message="连接超时，请检查网络连接"
        )
    except httpx.ConnectError:
        return TestResponse(
            success=False,
            message="无法连接到云雾 API 服务器，请检查 Base URL 配置"
        )
    except Exception as e:
        print(f"[Test] 连接测试失败: {str(e)}")
        return TestResponse(
            success=False,
            message=f"连接测试失败: {str(e)}"
        )
