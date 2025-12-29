"""
测试脚本 - 单图替换
"""
import asyncio
import os
import sys

# 添加 backend 到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app.core.replacer import quick_replace
from app.config import config


async def main():
    # 测试图片路径
    reference_image = r"e:\xobi666\image.png"
    product_image = r"e:\xobi666\image copy.png"
    
    if not os.path.exists(reference_image):
        print(f"[Error] 参考图不存在: {reference_image}")
        return
    
    if not os.path.exists(product_image):
        print(f"[Error] 产品图不存在: {product_image}")
        return
    
    print("=" * 50)
    print("Xobi 单图替换测试")
    print("=" * 50)
    print(f"参考图: {reference_image}")
    print(f"产品图: {product_image}")
    print()
    
    # 输出目录
    output_dir = os.path.join(os.path.dirname(__file__), "data", "outputs", "test")
    os.makedirs(output_dir, exist_ok=True)
    
    print("[Step 1] 开始处理...")
    
    result = await quick_replace(
        product_image_path=product_image,
        reference_image_path=reference_image,
        product_name="蓝牙音箱",
        custom_text=None,  # 自动生成
        output_dir=output_dir
    )
    
    print()
    print("=" * 50)
    print("处理结果")
    print("=" * 50)
    
    if result.get("success"):
        print(f"[Success] 生成成功!")
        print(f"图片保存在: {result.get('image_path')}")
        print()
        print("参考图分析:")
        import json
        print(json.dumps(result.get("reference_analysis"), indent=2, ensure_ascii=False))
        print()
        print("产品图分析:")
        print(json.dumps(result.get("product_analysis"), indent=2, ensure_ascii=False))
    else:
        print(f"[Failed] 生成失败: {result.get('message')}")
        if result.get("reference_analysis"):
            print("参考图分析:", result.get("reference_analysis"))
        if result.get("product_analysis"):
            print("产品图分析:", result.get("product_analysis"))


if __name__ == "__main__":
    asyncio.run(main())
