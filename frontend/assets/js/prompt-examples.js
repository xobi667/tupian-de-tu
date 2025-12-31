/**
 * Xobi Prompt 示例库
 * 提供各行业电商主图生成的示例 Prompt
 */

// Prompt 模板数据
const promptTemplates = [
    {
        category: "美妆护肤",
        icon: "💄",
        examples: [
            { text: "补水面膜，深层保湿锁水，夜间护理使用", tip: "适合干性肌肤" },
            { text: "口红，哑光质地不掉色，日常通勤妆容", tip: "显色持久" },
            { text: "精华液，抗衰老紧致，熟龄肌肤适用", tip: "淡化细纹" },
            { text: "防晒霜，SPF50+高倍防护，户外运动必备", tip: "清爽不油腻" },
            { text: "眼霜，淡化黑眼圈，长期熬夜人群", tip: "提亮眼周" }
        ]
    },
    {
        category: "3C 数码",
        icon: "📱",
        examples: [
            { text: "无线耳机，主动降噪技术，地铁通勤使用", tip: "续航24小时" },
            { text: "充电宝，大容量20000mAh，户外旅行必备", tip: "快充支持" },
            { text: "智能手表，运动监测心率，健身爱好者专用", tip: "防水50米" },
            { text: "蓝牙音箱，360度环绕音效，家庭聚会使用", tip: "低音震撼" },
            { text: "平板电脑，护眼屏幕，学生网课学习", tip: "轻薄便携" }
        ]
    },
    {
        category: "服饰鞋包",
        icon: "👗",
        examples: [
            { text: "运动鞋，透气轻便缓震，跑步健身穿搭", tip: "减震科技" },
            { text: "连衣裙，清新淑女风格，春夏约会穿搭", tip: "显瘦显高" },
            { text: "双肩包，大容量防水，学生通勤使用", tip: "护脊减压" },
            { text: "西装外套，商务正装，职场面试穿搭", tip: "修身版型" },
            { text: "卫衣，宽松慵懒风，休闲居家穿搭", tip: "纯棉舒适" }
        ]
    },
    {
        category: "家居生活",
        icon: "🏠",
        examples: [
            { text: "乳胶枕，颈椎支撑，上班族睡眠使用", tip: "改善颈椎" },
            { text: "空气炸锅，少油健康烹饪，减脂人群必备", tip: "智能控温" },
            { text: "电动牙刷，声波清洁，口腔护理使用", tip: "美白牙齿" },
            { text: "吸尘器，大吸力除螨，家庭清洁使用", tip: "无线便携" },
            { text: "香薰机，助眠放松，卧室氛围营造", tip: "静音设计" }
        ]
    },
    {
        category: "食品饮料",
        icon: "🍰",
        examples: [
            { text: "黑咖啡，提神醒脑，办公室加班必备", tip: "0糖0脂" },
            { text: "坚果礼盒，营养健康，逢年过节送礼", tip: "每日坚果" },
            { text: "蛋白粉，增肌塑形，健身人群补充", tip: "易吸收" },
            { text: "红茶，温润养胃，下午茶时光", tip: "古树原料" },
            { text: "酸奶，益生菌发酵，早餐营养搭配", tip: "0添加剂" }
        ]
    },
    {
        category: "母婴用品",
        icon: "👶",
        examples: [
            { text: "婴儿奶粉，营养配方，0-6个月宝宝", tip: "接近母乳" },
            { text: "纸尿裤，超薄透气，新生儿使用", tip: "瞬吸锁水" },
            { text: "婴儿车，轻便折叠，城市出行必备", tip: "避震升级" },
            { text: "婴儿湿巾，温和无刺激，敏感肌宝宝", tip: "加厚设计" },
            { text: "儿童餐椅，安全稳固，6个月+辅食喂养", tip: "可调节高度" }
        ]
    },
    {
        category: "运动户外",
        icon: "⚽",
        examples: [
            { text: "瑜伽垫，防滑加厚，居家健身使用", tip: "环保材质" },
            { text: "登山包，大容量防雨，户外徒步旅行", tip: "透气背负" },
            { text: "速干衣，吸汗快干，夏季跑步穿搭", tip: "轻薄透气" },
            { text: "哑铃，可调节重量，家庭力量训练", tip: "防滑手柄" },
            { text: "帐篷，防风防雨，露营野餐使用", tip: "快速搭建" }
        ]
    }
];

/**
 * 显示 Prompt 示例弹窗
 */
window.showPromptExamples = function() {
    // 检查是否已经存在弹窗
    let modal = document.getElementById('prompt-examples-modal');
    if (modal) {
        modal.style.display = 'flex';
        return;
    }

    // 创建弹窗
    modal = document.createElement('div');
    modal.id = 'prompt-examples-modal';
    modal.className = 'prompt-examples-modal';

    modal.innerHTML = `
        <div class="modal-overlay" onclick="closePromptExamples()"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3>💡 输入示例库</h3>
                <button class="modal-close-btn" onclick="closePromptExamples()">✕</button>
            </div>
            <div class="modal-body">
                <div class="categories-tabs">
                    ${promptTemplates.map((cat, index) => `
                        <button class="category-tab ${index === 0 ? 'active' : ''}"
                                onclick="switchCategory(${index})"
                                data-category="${index}">
                            ${cat.icon} ${cat.category}
                        </button>
                    `).join('')}
                </div>
                <div class="examples-container">
                    ${promptTemplates.map((cat, catIndex) => `
                        <div class="examples-list ${catIndex === 0 ? 'active' : ''}" data-category="${catIndex}">
                            ${cat.examples.map((example, exIndex) => `
                                <div class="example-item" onclick="useTemplate('${example.text.replace(/'/g, "\\'")}')">
                                    <div class="example-text">${example.text}</div>
                                    <div class="example-tip">${example.tip}</div>
                                    <button class="example-use-btn">使用此模板</button>
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="modal-footer">
                <div class="modal-footer-tip">
                    💡 点击任意模板即可快速应用，也可参考格式自行输入
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 添加动画
    setTimeout(() => modal.classList.add('show'), 10);
};

/**
 * 关闭 Prompt 示例弹窗
 */
window.closePromptExamples = function() {
    const modal = document.getElementById('prompt-examples-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }
};

/**
 * 切换分类标签
 */
window.switchCategory = function(categoryIndex) {
    // 更新标签激活状态
    document.querySelectorAll('.category-tab').forEach((tab, index) => {
        if (index === categoryIndex) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // 更新示例列表显示
    document.querySelectorAll('.examples-list').forEach((list, index) => {
        if (index === categoryIndex) {
            list.classList.add('active');
        } else {
            list.classList.remove('active');
        }
    });
};

/**
 * 使用模板文本
 */
window.useTemplate = function(text) {
    const input = document.getElementById('chat-input');
    if (input) {
        input.value = text;

        // 自动聚焦并触发提示
        input.focus();

        // 显示提示消息
        if (typeof addChatMessage === 'function') {
            addChatMessage('system', `✅ 已应用模板：${text}`);
        }
    }

    // 关闭弹窗
    closePromptExamples();
};

/**
 * 按 ESC 键关闭弹窗
 */
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closePromptExamples();
    }
});

console.log('[PromptExamples] 输入示例库已加载，包含', promptTemplates.length, '个分类');
