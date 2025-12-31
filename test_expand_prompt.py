"""
测试 /api/chat/expand-prompt 端点
"""

import requests
import json

# 测试配置
BASE_URL = "http://localhost:8000"
ENDPOINT = f"{BASE_URL}/api/chat/expand-prompt"

# 测试用例
test_cases = [
    {
        "name": "测试1: 无线耳机，降噪",
        "brief": "无线耳机，降噪"
    },
    {
        "name": "测试2: 护肤品，保湿",
        "brief": "护肤品，保湿"
    },
    {
        "name": "测试3: 运动鞋，跑步",
        "brief": "运动鞋，跑步"
    },
    {
        "name": "测试4: 智能手表，健康监测",
        "brief": "智能手表，健康监测"
    },
    {
        "name": "测试5: 咖啡机，自动研磨",
        "brief": "咖啡机，自动研磨"
    }
]

def test_expand_prompt(brief: str) -> dict:
    """测试 Prompt 扩展端点"""

    payload = {"brief": brief}

    try:
        response = requests.post(
            ENDPOINT,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )

        if response.status_code == 200:
            return {
                "success": True,
                "data": response.json()
            }
        else:
            return {
                "success": False,
                "error": f"HTTP {response.status_code}: {response.text}"
            }

    except requests.exceptions.ConnectionError:
        return {
            "success": False,
            "error": "无法连接到服务器。请确保后端服务正在运行 (python -m backend.main)"
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def main():
    print("=" * 60)
    print("测试 Prompt 扩展 API")
    print("=" * 60)
    print()

    for i, test_case in enumerate(test_cases, 1):
        print(f"\n{test_case['name']}")
        print("-" * 60)
        print(f"输入: {test_case['brief']}")

        result = test_expand_prompt(test_case['brief'])

        if result['success']:
            expanded = result['data'].get('expanded_prompt', '')
            print(f"输出: {expanded}")
            print(f"字数: {len(expanded)} 字")

            # 检查字数是否在 50-80 字范围内
            if 50 <= len(expanded) <= 80:
                print("✓ 字数符合要求 (50-80字)")
            else:
                print(f"✗ 字数不符合要求 (期望 50-80字，实际 {len(expanded)}字)")
        else:
            print(f"错误: {result['error']}")

        print()

    print("=" * 60)
    print("测试完成")
    print("=" * 60)

if __name__ == "__main__":
    main()
