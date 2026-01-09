// 电商平台规格配置
// ========================================

const PLATFORM_SPECS = {
    pinduoduo: {
        name: "拼多多",
        ratio: "1:1",
        size: "800x800",
        background: "white",
        style: "简约促销",
        description: "拼多多主图要求：正方形1:1，纯白背景，突出价格优势"
    },
    taobao: {
        name: "淘宝",
        ratio: "1:1",
        size: "800x800",
        background: "scene",
        style: "精致高端",
        description: "淘宝主图要求：正方形1:1，可使用场景图，注重品质感"
    },
    jd: {
        name: "京东",
        ratio: "1:1",
        size: "800x800",
        background: "white",
        style: "品质专业",
        description: "京东主图要求：正方形1:1，纯白背景，强调品质"
    },
    amazon: {
        name: "亚马逊",
        ratio: "1:1",
        size: "2000x2000",
        background: "pure_white",
        style: "极简专业",
        description: "亚马逊主图要求：高分辨率正方形，纯白背景（RGB 255,255,255）"
    },
    shopee: {
        name: "Shopee",
        ratio: "1:1",
        size: "1024x1024",
        background: "colorful",
        style: "活泼年轻",
        description: "Shopee主图要求：正方形1:1，可使用彩色背景，年轻化风格"
    },
    custom: {
        name: "自定义",
        ratio: "1:1",
        size: "1000x1000",
        background: "white",
        style: "通用",
        description: "自定义规格，可自由设置"
    }
};

const RATIO_SPECS = {
    "1:1": {
        name: "正方形",
        width: 1000,
        height: 1000,
        description: "适合大多数电商平台"
    },
    "3:4": {
        name: "竖版",
        width: 750,
        height: 1000,
        description: "适合手机端展示"
    },
    "4:3": {
        name: "横版",
        width: 1000,
        height: 750,
        description: "适合PC端展示"
    },
    "16:9": {
        name: "宽屏",
        width: 1920,
        height: 1080,
        description: "适合横幅广告"
    }
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PLATFORM_SPECS, RATIO_SPECS };
}
