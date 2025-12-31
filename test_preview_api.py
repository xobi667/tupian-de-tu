"""
测试预览 API 功能
"""
import requests
import os
import base64
from pathlib import Path

# 配置
BASE_URL = "http://localhost:8000"
PREVIEW_ENDPOINT = f"{BASE_URL}/api/preview/generate"

def test_preview_generation():
    """测试预览图生成"""
    print("=" * 50)
    print("测试预览图生成功能")
    print("=" * 50)

    # 准备测试图片（需要先准备一些测试图片）
    test_images_dir = Path("test_images")

    if not test_images_dir.exists():
        print(f"错误：测试图片目录不存在: {test_images_dir}")
        print("请创建 test_images 目录并放入以下文件：")
        print("  - product.png (产品图)")
        print("  - reference.png (参考图)")
        return

    product_image_path = test_images_dir / "product.png"
    reference_image_path = test_images_dir / "reference.png"

    if not product_image_path.exists() or not reference_image_path.exists():
        print("错误：测试图片不存在")
        print(f"需要的文件：")
        print(f"  - {product_image_path}")
        print(f"  - {reference_image_path}")
        return

    # 准备请求数据
    custom_prompt = """
    Role: Senior E-commerce Visual Architect.
    Subject: Wireless Headphones.
    Visual Style: High-end studio commercial photography.
    Environment: Modern minimalist setup with soft lighting.
    Goal: Professional brand visual.
    """

    files = {
        'product_image': ('product.png', open(product_image_path, 'rb'), 'image/png'),
        'reference_image': ('reference.png', open(reference_image_path, 'rb'), 'image/png'),
    }

    data = {
        'custom_prompt': custom_prompt,
        'custom_text': ''
    }

    print("\n发送预览生成请求...")
    print(f"端点: {PREVIEW_ENDPOINT}")
    print(f"Prompt: {custom_prompt[:100]}...")

    try:
        response = requests.post(
            PREVIEW_ENDPOINT,
            files=files,
            data=data,
            timeout=120  # 2分钟超时
        )

        # 关闭文件
        files['product_image'][1].close()
        files['reference_image'][1].close()

        print(f"\n响应状态码: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print("✅ 预览生成成功！")
            print(f"is_preview: {result.get('is_preview')}")
            print(f"mime_type: {result.get('mime_type')}")

            # 保存预览图
            if result.get('preview_data'):
                preview_data = result['preview_data']
                output_path = Path("test_output_preview.png")

                # 解码并保存
                image_bytes = base64.b64decode(preview_data)
                with open(output_path, 'wb') as f:
                    f.write(image_bytes)

                print(f"✅ 预览图已保存到: {output_path}")
                print(f"文件大小: {len(image_bytes)} bytes")
            else:
                print("⚠️ 未返回预览数据")
        else:
            print(f"❌ 请求失败: {response.status_code}")
            print(f"错误信息: {response.text}")

    except requests.exceptions.Timeout:
        print("❌ 请求超时")
    except requests.exceptions.ConnectionError:
        print("❌ 连接失败，请确保后端服务正在运行")
    except Exception as e:
        print(f"❌ 发生错误: {str(e)}")


def test_preview_without_images():
    """测试没有图片时的错误处理"""
    print("\n" + "=" * 50)
    print("测试错误处理（无图片）")
    print("=" * 50)

    data = {
        'custom_prompt': 'Test prompt',
        'custom_text': ''
    }

    try:
        response = requests.post(
            PREVIEW_ENDPOINT,
            data=data,
            timeout=30
        )

        print(f"响应状态码: {response.status_code}")

        if response.status_code != 200:
            print("✅ 正确返回错误响应")
            print(f"错误信息: {response.text[:200]}")
        else:
            print("⚠️ 应该返回错误但却成功了")

    except Exception as e:
        print(f"❌ 发生错误: {str(e)}")


def test_health_check():
    """测试健康检查"""
    print("\n" + "=" * 50)
    print("测试后端健康状态")
    print("=" * 50)

    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            print("✅ 后端服务正常运行")
        else:
            print(f"⚠️ 健康检查失败: {response.status_code}")
    except Exception as e:
        print(f"❌ 无法连接到后端服务: {str(e)}")
        print("请确保后端服务正在运行 (uvicorn backend.app.main:app)")


if __name__ == "__main__":
    print("Xobi 预览功能测试脚本")
    print("=" * 50)

    # 1. 健康检查
    test_health_check()

    # 2. 测试预览生成
    test_preview_generation()

    # 3. 测试错误处理
    test_preview_without_images()

    print("\n" + "=" * 50)
    print("测试完成")
    print("=" * 50)
