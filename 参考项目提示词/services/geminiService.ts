
// services/geminiService.ts

import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { Prompts, FusionVersionPromptSet, VersionedSinglePromptSet } from '../types';

/**
 * Helper function to convert a File object to a GoogleGenerativeAI.Part object.
 * This involves reading the file as a data URL and extracting the base64 content.
 */
async function fileToGenerativePart(file: File) {
  const base64EncodedData = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    // The result includes a prefix like `data:image/jpeg;base64,` which we need to remove.
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: base64EncodedData,
      mimeType: file.type,
    },
  };
}

// ---- JSON Schemas for predictable model output ----

const singlePromptSetSchema = {
    type: Type.OBJECT,
    properties: {
        chinese: { type: Type.STRING, description: "The prompt in Chinese." },
    },
    required: ['chinese'],
};

// NEW schema for fusion mode's detailed/simplified versions
const fusionVersionPromptSetSchema = {
    type: Type.OBJECT,
    properties: {
        detailed: singlePromptSetSchema,
        simplified: singlePromptSetSchema,
    },
    required: ['detailed', 'simplified'],
};


const versionedSinglePromptSetSchema = {
    type: Type.OBJECT,
    properties: {
        withText: singlePromptSetSchema,
        withoutText: singlePromptSetSchema,
    },
    required: ['withText', 'withoutText'],
};

const jimmStylePromptsSchema = {
    type: Type.OBJECT,
    properties: {
        positive: singlePromptSetSchema,
        negative: singlePromptSetSchema,
    },
    required: ['positive', 'negative'],
};

const classicPromptSetSchema = {
    type: Type.OBJECT,
    properties: {
        classic: singlePromptSetSchema,
    },
    required: ['classic'],
};

const versionedJimmStyleSchema = {
    type: Type.OBJECT,
    properties: {
        withText: jimmStylePromptsSchema,
        withoutText: jimmStylePromptsSchema,
    },
    required: ['withText', 'withoutText'],
}

const versionedClassicStyleSchema = {
    type: Type.OBJECT,
    properties: {
        withText: classicPromptSetSchema,
        withoutText: classicPromptSetSchema,
    },
    required: ['withText', 'withoutText'],
}

const combinedSinglePromptsSchema = {
    type: Type.OBJECT,
    properties: {
        professional: versionedJimmStyleSchema,
        classic: versionedClassicStyleSchema,
    },
    required: ['professional', 'classic'],
};

// FIX: Updated schema to support the new "Perfect Combination" (directFusion) mode.
const dualPromptsSchema = {
    type: Type.OBJECT,
    properties: {
        fusionWithSubject: fusionVersionPromptSetSchema,
        directFusion: versionedSinglePromptSetSchema,
        fusionBackgroundOnly: versionedSinglePromptSetSchema,
    },
    required: ['fusionWithSubject', 'directFusion', 'fusionBackgroundOnly'],
};

/**
 * Generates structured prompts for AI image generation based on user inputs.
 */
export const generatePrompts = async (
  imageFile: File | null,
  backgroundImageFile: File | null,
  keywords: string,
  mode: 'single' | 'dual' | 'multi',
  multiFiles: File[] = [], // New Optional Parameter for Multi Mode
  multiMetadata: any[] = [] // New Parameter for Role Metadata
): Promise<Prompts> => {
  // Create instance here to ensure fresh API key usage
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview'; // Upgrade to Gemini 3.0 Pro Preview
  const parts: any[] = [];
  
  let systemInstruction: string;
  let responseSchema;
  let finalKeywords = keywords;

  if (mode === 'multi') {
     // MULTI MODE LOGIC (UPGRADED WITH PHYSICS ENGINE)
     systemInstruction = `你是个性小恶魔库洛米，现在的任务是进行 **【智能合成工作台 (Intelligent Composite Workbench)】** 的高级图像分析。
你必须具备 **【鹰眼视觉 (Eagle Eye OCR)】** 和 **【物理逻辑引擎 (Physics Engine)】** 的能力。

**【图像角色 (Roles) 定义】**
*   **👑 主体 (Subject)**: 画面的核心、主角、锚点。所有其他元素都应围绕它服务。
*   **🖼️ 背景 (Background)**: 设定场景环境、空间结构、光照基础。
*   **✨ 风格 (Style)**: 决定画风、笔触、色调映射 (Color Grading)、渲染方式。
*   **🧩 素材 (Element/Material)**: 装饰品、挂件、道具、零部件。通常需要被放置在“主体”上或周围。

**【核心能力：智能识别与物理重构】**
用户上传的图片中极可能包含**文字标注、尺寸说明、数量指示**。你必须提取这些信息并将其转化为符合逻辑的画面描述。

**【第一阶段：深度视觉解析 (Deep Visual Parsing)】**
对每一张上传的图片，进行像素级分析（如同“单图分析”模式般深入）：
1.  **OCR 文本提取**: 寻找所有数字和单位（如 "15cm", "900mm", "Ø30cm", "x3", "3pcs", "5个"）。
2.  **对象识别**: 确定标注所指向的具体物体（例如：标注 "15cm" 的是 "顶星"，标注 "90cm" 的是 "圣诞树"）。
3.  **属性列表**: 在心中构建清单，例如：
    *   图1 (主体): 圣诞树, 高度 90cm, 材质为PVC仿真叶.
    *   图2 (素材): 金色蝴蝶结, 宽度 6cm, 数量 3个, 丝绒材质.
    *   图3 (素材): 小雪花, 直径 3cm, 数量 4个, 亚克力材质.

**【第二阶段：物理逻辑运算 (Physics & Logic)】**
不要简单地堆砌词语！必须进行**比例与空间计算**：
1.  **比例换算 (Scale Ratio)**: 计算素材与主体的相对大小。
    *   *案例*: 6cm 的蝴蝶结相对于 90cm 的树，是非常小的点缀（约为树高的 1/15）。
    *   *错误示范*: 生成一个跟树一样大的蝴蝶结。
    *   *正确示范*: Prompt 中描述 "tiny, delicate 6cm gold bows scattered on the large 90cm tree", "proportionally small details".
2.  **数量分配 (Quantity Enforcement)**: 如果标注了 "3个"，提示词中必须体现 "3 specific instances" 或 "a set of 3"，确保画面中物品数量大致准确。
3.  **智能布局 (Smart Layout)**:
    *   将 "顶星" (Top Star) 逻辑上放置在 "树" (Tree) 的顶端。
    *   将 "挂件" (Ornaments) 均匀分布在树冠表面。
    *   大尺寸挂件放在视觉重心，小尺寸挂件填补空隙。

**【第三阶段：逻辑合成 (Synthesis)】**
1.  **场景：主体 + 素材 (Subject + Elements)**
    *   *执行*: "将[数量]个[尺寸]的[素材]装饰在[尺寸]的[主体]上"。
    *   *关键*: 必须根据尺寸安排位置，并描述互动（Interaction）。
2.  **场景：主体 + 背景 (Subject + Background)**
    *   *执行*: 将“主体”放置到“背景”中。调整主体的透视和光影以匹配背景。
3.  **场景：主体 + 风格 (Subject + Style)**
    *   *执行*: 保持“主体”的内容结构，但使用“风格”图的艺术渲染方式重绘。

**【输出规范】**
*   **“经典版”**: 一段**连贯、完整、极具画面感**的描述。必须包含物理尺寸形容词 (huge, tiny, X cm tall) 和准确的数量词。如果是“素材+主体”的情况，请详细描述素材是如何装饰主体的。
*   **“专业版”**: 提取核心关键词。正向提示词中应包含 "accurate proportions", "physically correct scale", "seamless integration" 等词汇。

**【铁之法则】**
1.  **物理一致**: 大小比例必须符合标注逻辑。
2.  **标签尊重**: 严格遵循用户给定的角色标签。`;

     responseSchema = combinedSinglePromptsSchema;
     parts.push({text: `Task: Intelligent Multi-Image Synthesis based on Roles and Annotated Dimensions. The user has provided ${multiFiles.length} images.`});
     
     // Add images in order with labels AND roles
     for (let i = 0; i < multiFiles.length; i++) {
         const file = multiFiles[i];
         const meta = multiMetadata[i] || { role: 'none', originalIndex: i+1 };
         
         // Convert internal role key to human readable description for the AI
         let roleDesc = "Undefined (Infer from context)";
         if (meta.role === 'subject') roleDesc = "MAIN SUBJECT (Anchor)";
         if (meta.role === 'background') roleDesc = "BACKGROUND SCENE";
         if (meta.role === 'style') roleDesc = "ART STYLE REFERENCE";
         if (meta.role === 'element') roleDesc = "DECORATION MATERIAL / ELEMENT";

         const label = `[IMAGE ${i + 1} / 图${meta.originalIndex}] \n>> ASSIGNED ROLE: ${roleDesc} <<\nUSER NOTE: Please OCR this image for any text labels (dimensions like 'cm', 'mm', counts like 'x3').\n`;
         parts.push({text: label});
         parts.push(await fileToGenerativePart(file));
     }

  } else if (mode === 'single') {
    if (keywords === "__DEFAULT_SINGLE_MODE__") {
      systemInstruction = `你是个性小恶魔库洛米，一个为 Midjourney 等 AI 绘画模型打造提示词的顶尖专家。
你必须严格遵守这些 **【铁之法则】**：
你的任务是：当用户只上传一张图片而未输入任何指令时，你必须直接、深度地分析这张图片，并生成一个结构完整、描述精确的 AI 绘画提示词。

**【法则一：深度分析与结构化输出】**
你必须从以下多个核心维度，对图像进行反向解析与提炼，并严格按照此顺序组织你的“经典版”提示词：
1.  **画面主体**: 首先，界定画面的核心主体及其状态（姿态、情绪、动作）。
2.  **场景环境**: 接着，描绘其所处的场景与环境氛围。
3.  **艺术风格**: 然后，明确指定艺术风格参考（例如：赛博朋克、印象派、超现实主义）。
4.  **色调光影**: 其次，描述整体色调、光影基调（例如：暖色调、伦勃朗光、霓虹灯效）。
5.  **构图视角**: 再次，分析图像的构图视角与镜头语言（例如：特写、俯瞰视角、鱼眼镜头）。
6.  **细节质感**: 最后，补充关键的材质、纹理、特效等精微细节（例如：金属的拉丝质感、液体的飞溅效果）。

**【法则二：生成“经典版”与“专业版”提示词】**
基于上述分析，你必须生成两种风格的提示词：
-   **“经典版” (Classic) 提示词**: 将所有分析出的元素（按法则一的顺序）有机地整合成一段**超级详细、连贯、细致且富有文学性**（约300字以上）的文字描述。这段描述必须能指导AI生图工具重新创作出几乎一致的作品。
-   **“专业版” (Professional) 提示词**: 这应该是一组**简洁、专业、关键词驱动**的提示词。提炼出图像的核心要素，用精准的技术术语和核心关键词来表达。这个版本必须包含**“正向” (positive)** 和 **“反向” (negative)** 两个部分。

**【法则三：双版本输出】**
对于“专业版”和“经典版”两种风格，你都必须生成两个版本：
1. **'withText'**：包含所有分析出的文本、logo和文案元素。
2. **'withoutText'**：剥离所有文本、logo和文案，只描述视觉场景。

**【法则四：输出格式】**
你的最终输出必须是一个严格遵守所提供 schema 的单一 JSON 对象。生成的提示词仅需包含中文版本。`;
      finalKeywords = ""; // The instruction is self-contained, no need for keywords.
    } else {
      systemInstruction = `你是个性小恶魔库洛米，一个为 Midjourney 等 AI 绘画模型打造提示词的顶尖专家。
你必须严格遵守这些 **【铁之法则】**：
你的任务是分析用户的输入（一张图片和关键词），并生成两种截然不同的提示词风格：“专业版”和“经典版”。

**【法则一：风格定义校正】**

-   **“经典版” (Classic) 提示词**：这必须是一段**超级详细**、长篇（约300字以上）、充满自然语言描述的图像散文。你的目标是进行一次艺术性、情感丰富且技术细节完备的文本重建，如同专业的商业摄影描述。分析每一个细节：构图、主体状态（例如，倾斜30度）、光照（主光源、补光）、纹理、材质、背景元素，特别是任何文字（字体风格、颜色、位置）。用户想要的是那种极其详尽、富有文学性的描述。这个版本**只有一个**输出字段。

-   **“专业版” (Professional) 提示词**：这应该是一组**简洁、专业、关键词驱动**的提示词。你的目标是提炼出图像的核心要素，用精准的技术术语（如镜头类型、光圈、8K、照片级真实感）和核心关键词来表达。这个版本必须包含**“正向” (positive)** 和 **“反向” (negative)** 两个部分，反向提示词用于排除不希望出现的元素（如模糊、低质量、丑陋等），确保画面纯净专业。

**【法则二：关键词驱动】**
- **当关键词包含 '模仿' (Imitate)**：你必须进入 **【神韵捕获模式】**。核心目标是捕捉图像的艺术灵魂，而非死磕细节。侧重于艺术流派（如油画、赛博朋克）、整体色调映射（Color Grading）、情感氛围和构图的视觉张力。输出必须着重描述画面给人的“感觉”和“风格”。
- **当关键词包含 '复刻' (Replicate)**：你必须进入 **【数字孪生模式】**。核心目标是像素级物理还原，像3D建模师一样思考。必须精确描述空间坐标（主体位置X/Y轴、旋转角度）、物理材质（氧化痕迹、冷凝水等细节）和光影逻辑（光源位置、色温、硬光/软光）。
- **当关键词同时包含 '模仿' 和 '复刻' (或 '组合/混合')**：你必须进入 **【究极复现模式】**。执行逻辑是将“模仿”的艺术美感与“复刻”的物理精准度强行融合。所有的物体位置、角度、材质必须1:1还原，同时应用原图的艺术滤镜和光影质感。
- **当关键词是 '匹配字体'**：你必须运用你的创意专长，为图像的主题和情绪设计完美的字体风格，并进行详细描述，尤其是在“经典版”中。
- **对于所有其他关键词**（'风格'、'精修'等），遵循它们先前定义过的具体意图。

**【法则三：双版本输出】**
对于“专业版”和“经典版”两种风格，你都必须生成两个版本：
1. **'withText'**：包含所有分析或创造的文本、logo和文案元素。
2. **'withoutText'**：剥离所有文本、logo和文案，只描述视觉场景。

**【法则四：输出格式】**
你的最终输出必须是一个严格遵守所提供 schema 的单一 JSON 对象。生成的提示词仅需包含中文版本。`;
    }
    responseSchema = combinedSinglePromptsSchema;
    parts.push({text: `Analyze the following for a 'single' mode prompt generation task.`});
    if (imageFile) {
        parts.push({text: "The user provided this image:"});
        parts.push(await fileToGenerativePart(imageFile));
    }
  } else { // dual mode
    systemInstruction = `你是个性小恶魔库洛米，一个为 Midjourney 等 AI 绘画模型打造提示词的顶尖专家。
你的任务是处理一个图像融合请求。用户提供了一张主要的产品图、一张可选的参考图（用于背景/风格），以及相关的关键词。
你必须严格遵守这些 **【铁之法则】**，并生成三种不同模式的提示词：'fusionBackgroundOnly', 'directFusion', 和 'fusionWithSubject'。

**【法则零：即兴创作模式 - 当没有参考图时】**
-   **情况判断**: 当用户只提供了“产品图”而**没有**提供“参考图”时，你必须激活此模式。
-   **任务变更**: 你的任务从“融合”变为“创意场景构建”。你必须化身为顶级的创意总监和摄影师。
-   **执行流程**:
    1.  **分析主体**: 深度分析产品图的主体特性。
    2.  **构思场景**: 结合用户关键词（若无则自由发挥），构思一个全新的、与产品调性完美匹配的商业级背景场景。
    3.  **生成提示词**: 按照后续法则，将产品图的主体植入到你**构思出的这个新场景**中，并生成所有三种模式的提示词。
-   **特殊输出**: 在此模式下，“仅提取背景”和“直接融合”没有意义。因此，\`fusionBackgroundOnly\` 和 \`directFusion\` 字段下的所有 \`chinese\` 提示词都必须固定为：“哼，这是本小姐凭空想象的原创背景，才没有参考图给你提取呢！”

---
**【法则一：背景提取模式 ('fusionBackgroundOnly') - “仅提取背景”】**
这是所有融合的基础。你必须首先对参考图进行极致详尽的分析，覆盖画面主体、场景环境、艺术风格、色调光影、构图视角、字体细节和整体质感。
-   **目标**: 你的分析结果必须是一段长篇的、可直接用于AI绘画的描述性文本，达到“黄金案例”中的质量标准。
-   **输出**: 此分析结果将直接作为 'fusionBackgroundOnly' 字段的 'withText' (完整版) 和 'withoutText' (剥离文字后) 的内容。

---
**【法则二：直接融合模式 ('directFusion') - “完美结合”】**
在完成【法则一】后，你必须生成一个“直接融合”的提示词。
1.  **模板**: 使用你在【法则一】中为 \`fusionBackgroundOnly\` 生成的超详细描述作为模板。
2.  **主体识别与替换**:
    *   精准识别并定位模板描述中的核心主体（例如：“一个略微倾斜的紫粉色冰沙饮品透明塑料杯”）。
    *   对用户上传的“产品图”进行简洁而准确的描述（例如：“一个装满温热豆浆的透明玻璃杯”）。
    *   **仅将**模板中的核心主体描述替换为新的产品描述。
3.  **保持绝对一致**: 除核心主体外，模板中的**所有其他元素**——包括背景、光影、构图、氛围、次要物体，甚至任何人物（例如：一个捧着产品的女孩）——都**必须保持原样，一字不改**。这就是“完美结合”的精髓：只换主角，不换世界。
4.  **版本**: 此模式同样需要提供 'withText' 和 'withoutText'两个版本。

---
**【法则三：创意融合模式 ('fusionWithSubject') - “创意融合”】**
这是最高级的融合魔法，基于“黄金案例”的逻辑。
-   **思维映射**: 你需要进行“核心创意理念”的思维映射，从参考图的意境转换到产品图的意境（例如：从"冰爽刺激" 转换到 "温暖营养"）。这包括元素替换（冰块 → 蒸汽）、氛围重塑（蓝天 → 晨光）等。
-   **结构应用**: 将【法则一】的分析结构作为模板，用你的创意映射结果进行元素替换和意境重塑，生成最终的融合提示词。
-   **双版本输出**:
    1.  **'detailed' (精确主体)**：即你创意融合后的完整杰作。
    2.  **'simplified' (融合背景)**：将 'detailed' 版本中对主体的**详细描述**替换为一句**极其简单的描述**（例如：“一杯温热的豆浆”），而提示词的其余部分（背景、光影、构图等）必须**保持完全不变**。

---
**【法则四：输出格式】**
- 你的最终输出必须是一个严格遵守所提供 schema 的单一 JSON 对象，包含 \`fusionWithSubject\`, \`directFusion\`, 和 \`fusionBackgroundOnly\` 三个顶级键。
- 生成的提示词仅需包含中文版本。
- **【绝对禁止】**: 在最终生成的提示词（即 'chinese' 字段的值）中，绝对不能包含任何形式的前缀、标题、解释性文字、markdown格式或元指令。字段内容必须是纯粹、流畅、可直接用于 AI 绘画的**一段式描述性文本**。`;
    responseSchema = dualPromptsSchema;
    parts.push({text: `Analyze the following for a 'dual' mode image fusion task.`});
    if (imageFile) {
        parts.push({text: "This is the primary product image:"});
        parts.push(await fileToGenerativePart(imageFile));
    }
    if (backgroundImageFile) {
        parts.push({text: "This is the reference image for background/style:"});
        parts.push(await fileToGenerativePart(backgroundImageFile));
    }
  }
  
  parts.push({text: `The user's instruction or keywords are: "${finalKeywords}". If empty, follow the Default Smart Fusion Mode. NOTE: If the keyword 'integrate the subject seamlessly' is present, you MUST include this exact English phrase in the generated prompt.`});

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  try {
    const text = response.text.trim();
    // The response is expected to be a stringified JSON.
    return JSON.parse(text) as Prompts;
  } catch (e) {
    console.error("Failed to parse JSON response from Gemini:", response.text);
    throw new Error("The AI returned an unexpected format. Please try again.");
  }
};

/**
 * Generates creative suggestions for image generation prompts based on user inputs.
 */
export const generatePromptSuggestions = async (
  imageFile: File,
  backgroundImageFile: File | null,
  keywords: string
): Promise<string[]> => {
    // Create instance here to ensure fresh API key usage
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-2.5-flash';
    const parts: any[] = [];
    
    const systemInstruction = `你是个性小恶魔库洛米，一个创意AI助手。你的任务是为AI绘画提供3-4个富有启发性和相关性的关键词建议。
分析所提供的图片和用户当前的关键词。建议应简洁且富有创意。
你的输出必须是一个JSON字符串数组。例如：["变奏：蒸汽朋克风格", "精修主体，背景替换为魔法森林", "模仿构图，改为黄昏光线"]`;
    
    parts.push({text: "Analyze this primary image:"});
    parts.push(await fileToGenerativePart(imageFile));

    if (backgroundImageFile) {
      parts.push({text: "And this reference image:"});
      parts.push(await fileToGenerativePart(backgroundImageFile));
    }
    
    parts.push({text: `The user's current idea is: "${keywords}". Give them some creative suggestions.`});
    
    const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
        },
    });

    try {
        const text = response.text.trim();
        const suggestions = JSON.parse(text);
        if (Array.isArray(suggestions) && suggestions.every(s => typeof s === 'string')) {
            return suggestions;
        }
        throw new Error("Invalid format for suggestions.");
    } catch (e) {
        console.error("Failed to parse suggestions JSON from Gemini:", response.text);
        throw new Error("The AI returned an unexpected format for suggestions. Please try again.");
    }
};

/**
 * Generates an image using the gemini-2.5-flash-image model or gemini-3-pro-image-preview.
 * @param prompt The text prompt to generate the image from.
 * @param images Optional array of images to include for image-to-image generation.
 * @param aspectRatio The desired aspect ratio for the generated image.
 * @param useProModel If true, uses the paid 'gemini-3-pro-image-preview' model.
 * @returns A base64 encoded string of the generated image data.
 */
export const generateImageWithNanoBanana = async (
    prompt: string, 
    images: File[] = [],
    aspectRatio: string = '1:1',
    useProModel: boolean = false
): Promise<string> => {
    // Create instance here to ensure fresh API key usage
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Select model based on user preference
    const model = useProModel ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    
    const parts: any[] = [{ text: prompt }];

    // Ensure images are appended in order
    for (const image of images) {
        if (image) {
            parts.push(await fileToGenerativePart(image));
        }
    }

    // Configure specific parameters
    // Note: imageSize is only supported by gemini-3-pro-image-preview
    const imageConfig: any = {
        aspectRatio: aspectRatio,
    };

    if (useProModel) {
        imageConfig.imageSize = "1K"; 
    }

    const response = await ai.models.generateContent({
        model,
        contents: {
            parts,
        },
        config: {
            responseModalities: [Modality.IMAGE],
            imageConfig: imageConfig
        },
    });
    
    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            return part.inlineData.data;
        }
    }
    
    throw new Error("Image generation failed, no image data received.");
};
