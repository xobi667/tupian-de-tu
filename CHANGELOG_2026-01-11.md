# Xobi v3 代码审查与修复报告

**日期**: 2026-01-11
**范围**: 前端 CanvasPage、LandingPage、ImagePreview + 后端 ai_controller

---

## 一、问题修复概览

| 文件 | 问题类型 | 修复内容 |
|------|----------|----------|
| CanvasPage.tsx | 未使用导入 | 移除 `ChevronDown` |
| CanvasPage.tsx | 重复代码 | 提取 `calculateImageSize()` 和 `generateImageId()` 工具函数 |
| CanvasPage.tsx | 依赖数组bug | `handleAddImageToCanvas` 使用函数式更新避免stale closure |
| CanvasPage.tsx | 功能缺失 | 添加 `handleResetChat` 重置对话功能 |
| CanvasPage.tsx | UI状态错误 | textarea和发送按钮的disabled状态添加 `isGeneratingImage` 检查 |
| CanvasPage.tsx | 无功能按钮 | 注释掉底部未实现的 Upload/Palette 按钮 |
| LandingPage.tsx | 未使用导入 | 移除 `Image as ImageIcon` |
| LandingPage.tsx | 重复代码 | 提取 `processImageFiles()` 通用函数 |
| ai_controller.py | 参考图支持 | 添加 `_decode_base64_image()` 函数解码base64图片 |
| ai_controller.py | 多图生成 | 循环生成多张图片并返回数组 |

---

## 二、详细修改说明

### 2.1 CanvasPage.tsx

#### 2.1.1 新增工具函数（消除重复代码）

```typescript
/**
 * 计算图片尺寸，超大尺寸时等比缩放
 */
function calculateImageSize(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number = 1200
): { width: number; height: number } {
  let width = originalWidth;
  let height = originalHeight;

  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  return { width, height };
}

/**
 * 生成唯一图片ID
 */
function generateImageId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
```

#### 2.1.2 修复 handleAddImageToCanvas 依赖问题

**问题**: 使用 `images.length` 导致闭包捕获旧值

**修复**: 使用函数式状态更新 `prev.length`

```typescript
const handleAddImageToCanvas = useCallback((src: string, width: number, height: number) => {
  const { width: finalWidth, height: finalHeight } = calculateImageSize(width, height);

  setImages((prev) => {
    const newImage: CanvasImage = {
      id: generateImageId(),
      src,
      x: 100 + prev.length * 50,  // 使用 prev.length 而非 images.length
      y: 100 + prev.length * 50,
      width: finalWidth,
      height: finalHeight,
      rotation: 0,
      selected: false,
    };
    return [...prev, newImage];
  });
  // ...
}, []);  // 依赖数组为空，避免不必要的重新创建
```

#### 2.1.3 添加重置对话功能

```typescript
const handleResetChat = useCallback(() => {
  const welcomeContent = initialConfig?.prompt
    ? `收到！你想要：\n\n「${initialConfig.prompt}」\n\n点击「生成图片」立即创作！`
    : 'Hi，我是你的AI设计师\n\n告诉我你想创作什么';
  setMessages([{ role: 'ai', content: welcomeContent }]);
  setInput('');
}, [initialConfig]);
```

#### 2.1.4 修复输入区域禁用状态

```typescript
// textarea
disabled={isLoading || isGeneratingImage}

// 发送按钮
disabled={!input.trim() || isLoading || isGeneratingImage}
className={`... ${
  input.trim() && !isLoading && !isGeneratingImage
    ? 'bg-purple-vibrant text-white hover:bg-purple-vibrant/80'
    : 'bg-white/5 text-white/20'
}`}
```

---

### 2.2 LandingPage.tsx

#### 2.2.1 提取通用图片处理函数

```typescript
// 通用的图片文件处理函数
const processImageFiles = (files: File[]) => {
  files.forEach((file) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setReferenceImages((prev) => [
        ...prev,
        {
          id: `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          src: event.target?.result as string,
          file
        },
      ]);
    };
    reader.readAsDataURL(file);
  });
};

// handleImageUpload 和 handleDrop 都使用 processImageFiles
const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files || []);
  processImageFiles(files);
  e.target.value = '';
};

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  const files = Array.from(e.dataTransfer.files);
  processImageFiles(files);
};
```

---

### 2.3 后端 ai_controller.py

#### 2.3.1 Base64图片解码函数

```python
def _decode_base64_image(base64_str: str) -> Image.Image:
    """
    Decode base64 string to PIL Image
    """
    # Remove data URL prefix if present (e.g., "data:image/png;base64,")
    if ',' in base64_str:
        base64_str = base64_str.split(',', 1)[1]

    image_data = base64.b64decode(base64_str)
    return Image.open(BytesIO(image_data))
```

#### 2.3.2 参考图处理逻辑

```python
# 构建带参考图的 prompt 和 ref_images 列表
enhanced_prompt = prompt
ref_images = []

if reference_images:
    enhanced_prompt = f"请基于提供的参考图片，生成电商产品图。产品描述：{prompt}"
    for idx, base64_str in enumerate(reference_images):
        try:
            img = _decode_base64_image(base64_str)
            ref_images.append(img)
        except Exception as decode_error:
            logger.warning(f"Failed to decode reference image {idx+1}: {decode_error}")

# 调用图片生成API时传入参考图
generated_image = ai_service.image_provider.generate_image(
    prompt=enhanced_prompt,
    ref_images=ref_images if ref_images else None,
    aspect_ratio=aspect_ratio,
    resolution="1K"
)
```

---

## 三、代码质量改进

### 3.1 消除的重复代码

| 位置 | 重复次数 | 解决方案 |
|------|----------|----------|
| CanvasPage 图片尺寸计算 | 3次 | `calculateImageSize()` |
| CanvasPage 图片ID生成 | 3次 | `generateImageId()` |
| LandingPage 图片文件处理 | 2次 | `processImageFiles()` |

### 3.2 移除的未使用导入

- `CanvasPage.tsx`: `ChevronDown`
- `LandingPage.tsx`: `Image as ImageIcon`

### 3.3 修复的潜在Bug

1. **Stale Closure**: `handleAddImageToCanvas` 中的 `images.length` 可能捕获过期值
2. **UI状态不同步**: 图片生成中时输入框和按钮应被禁用
3. **无功能按钮**: 底部工具按钮没有实现功能却可点击

---

## 四、测试建议

1. **参考图生成测试**: 在LandingPage上传参考图，跳转到Canvas页面后点击生成，验证参考图是否被正确使用
2. **多图生成测试**: 设置生成4张图片，验证是否全部添加到画布
3. **重置对话测试**: 点击AI设计师侧边栏的重置按钮，验证对话是否重置
4. **禁用状态测试**: 在图片生成过程中，验证输入框和发送按钮是否被禁用

---

## 五、后续建议

1. **实现底部工具按钮功能**: Upload（上传参考图到对话）和 Palette（调色板/风格选择）
2. **考虑添加图片生成进度指示**: 生成多张图片时显示进度 (1/4, 2/4...)
3. **优化大文件处理**: 参考图在发送前可以考虑压缩以减少API传输时间
