/**
 * AI Copilot 聊天逻辑
 * 
 * 功能：
 * - 用户与 AI 对话
 * - 解析 @标签 引用
 * - 处理 AI 返回的动作（update_table, start_job）
 */

let chatHistory = [];  // 当前会话的聊天历史

/**
 * 初始化聊天模块
 */
function initChat() {
    const input = document.getElementById('chat-input');
    if (!input) return;

    // 绑定 Enter 键发送
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            // 如果提及菜单正在显示，不发送消息（让菜单处理 Enter 键）
            const mentionMenu = document.getElementById('mention-menu');
            if (mentionMenu && mentionMenu.style.display !== 'none') {
                return;
            }
            sendChat();
        }
    });
}

/**
 * 发送聊天消息
 * @param {Object} options - 发送选项 { message: string, final_trigger: boolean }
 */
async function sendChat(options = {}) {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    // 优先使用 options.message，否则从输入框拿
    const msg = options.message || input.value.trim();
    if (!msg && !options.final_trigger) return;

    // 解析消息中的 @标签 引用
    const parsedMessage = parseTagReferences(msg);

    // 乐观更新 UI - 显示用户消息
    if (msg) addChatMessage('user', msg);
    input.value = '';

    // 添加到历史记录（用户消息）
    if (msg) {
        chatHistory.push({
            role: "user",
            parts: [{ text: parsedMessage.text }]
        });
    }

    // === 显示等待状态 ===
    setChatLoading(true);

    // 显示 AI 思考中的占位消息
    const thinkingId = showThinkingMessage();

    // 如果是最终确认，锁定按钮防止重复触发
    if (options.final_trigger) {
        setChatLoading(true, '正在排队渲染...');
    }

    try {
        // 构建请求体
        const payload = {
            message: parsedMessage.text || (options.final_trigger ? "开始生成" : ""),
            job_id: typeof currentBatchId !== 'undefined' ? currentBatchId : null,
            history: chatHistory,
            references: parsedMessage.references,
            quality: typeof getSelectedParams === 'function' ? getSelectedParams().quality : '1K',
            aspect_ratio: typeof getSelectedParams === 'function' ? getSelectedParams().ratio : '1:1',
            final_trigger: !!options.final_trigger
        };

        // 增加 75s 超时控制 (给后端 60s + 自动重试预留缓冲)
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI 大脑忙碌中 (超时)，请直接点击“确认方案”生图')), 75000)
        );

        const apiPromise = Api.post('/api/chat/', payload);
        const data = await Promise.race([apiPromise, timeoutPromise]);

        // 移除思考中消息
        removeThinkingMessage(thinkingId);

        if (data.response) {
            let aiReply = data.response;
            addChatMessage('ai', aiReply);

            // 添加到历史记录（AI 回复）
            chatHistory.push({
                role: "model",
                parts: [{ text: aiReply }]
            });

            // 如果 AI 提供了建议但还没有触发最终生成，自动生成预览图
            const hasImages = document.getElementById('ref-input')?.files?.[0] &&
                            document.getElementById('prod-input')?.files?.[0];
            const hasSuggestions = aiReply.includes('[建议');
            const isNotFinalGen = !aiReply.includes('正在为您生成') &&
                                !aiReply.includes('渲染图') &&
                                !aiReply.includes('任务处理中');

            if (hasImages && hasSuggestions && isNotFinalGen && data.data?.custom_prompt) {
                // 保存生成的 prompt
                window.lastGeneratedPrompt = data.data.custom_prompt;
                // 自动生成预览
                setTimeout(() => {
                    addChatMessage('system', '正在为您生成预览图...');
                    generatePreview(data.data.custom_prompt);
                }, 500);
            }
        }

        // 若额外有建议列表，作为独立机器人建议气泡展示（方便用户点选）
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
            const suggText = data.suggestions
                .map((s, idx) => `[建议${idx + 1}: ${s}]`)
                .join(' ');
            addChatMessage('ai', suggText);
        }

        // 处理 AI 返回的动作
        const actionData = data.data || {};

        if (data.action === 'update_table') {
            log('success', 'AI 更新了任务参数');

            // 刷新表格（批量模式下）
            if (typeof currentBatchId !== 'undefined' && currentBatchId) {
                const job = await Api.get(`/api/replace/batch/${currentBatchId}`);
                if (typeof renderBatchTable === 'function') {
                    renderBatchTable(job.items);
                }
            }

            addChatMessage('system', '✅ 已更新任务列表');
        }
        else if (data.action === 'start_job' || data.action === 'generate') {
            // 触发任务开始，透传 AI 解析的数据（包含自定义提示词等）
            if (typeof startSingleGen === 'function') {
                startSingleGen(actionData);
            } else if (typeof startBatchJob === 'function') {
                startBatchJob(actionData);
            }
        }

    } catch (e) {
        removeThinkingMessage(thinkingId);
        const errorMsg = typeof e === 'object' ? (e.message || JSON.stringify(e)) : String(e);
        addChatMessage('system', `发送失败: ${errorMsg}`);
    } finally {
        // === 恢复输入状态 ===
        setChatLoading(false);
    }
}

/**
 * 手动触发预览生成
 */
window.manualPreview = async function() {
    const input = document.getElementById('chat-input');
    const userInput = input.value.trim();

    if (!userInput && !window.lastGeneratedPrompt) {
        addChatMessage('system', '请先输入描述或让 AI 为您生成建议');
        return;
    }

    // 使用用户输入或最后生成的 prompt
    const prompt = userInput || window.lastGeneratedPrompt;

    // 保存为最后的 prompt
    if (userInput) {
        window.lastGeneratedPrompt = userInput;
    }

    await generatePreview(prompt);
};

/**
 * AI 帮写功能 - 扩展用户输入的简短描述为完整 Prompt
 */
window.aiHelpWrite = async function() {
    const input = document.getElementById('chat-input');
    if (!input) return;

    const userInput = input.value.trim();

    // 检查输入框是否有内容
    if (!userInput) {
        addChatMessage('system', '⚠️ 请先输入简短描述，AI 将帮您扩展成完整需求');
        return;
    }

    // 显示加载状态
    setChatLoading(true, 'AI 正在帮您扩展...');

    try {
        // 调用后端 API
        const data = await Api.post('/api/chat/expand-prompt', {
            brief: userInput
        });

        if (data.expanded_prompt) {
            // 将扩展结果填回输入框
            input.value = data.expanded_prompt;

            // 在聊天区显示系统消息
            addChatMessage('system', `✨ 已为您扩展成完整描述：${data.expanded_prompt}`);
        } else {
            throw new Error('未返回扩展内容');
        }

    } catch (e) {
        const errorMsg = typeof e === 'object' ? (e.message || JSON.stringify(e)) : String(e);
        addChatMessage('system', `❌ AI 扩展失败: ${errorMsg}，请稍后重试`);
    } finally {
        // 恢复输入状态
        setChatLoading(false);
    }
};

/**
 * 设置聊天加载状态
 * @param {boolean} loading - 是否正在加载
 * @param {string} loadingText - 自定义加载提示文案
 */
function setChatLoading(loading, loadingText = null) {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    if (input) {
        input.disabled = loading;
        input.placeholder = loading ? (loadingText || 'AI 思考中...') : '输入消息...';
    }
    if (sendBtn) {
        sendBtn.disabled = loading;
        sendBtn.innerHTML = loading ? '<span class="loading-dots">···</span>' : '<span>⬆</span>';
    }
}

/**
 * 显示 AI 思考中的占位消息
 * @returns {string} - 消息 ID
 */
function showThinkingMessage() {
    const container = document.getElementById('chat-messages');
    if (!container) return '';

    const msgId = 'thinking-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.id = msgId;
    msgDiv.className = 'message ai thinking';
    msgDiv.innerHTML = `
        <div class="message-bubble">
            <span class="thinking-animation">机器人正在回复和生成建议...</span>
        </div>
    `;

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;

    return msgId;
}

/**
 * 移除思考中的占位消息
 * @param {string} msgId - 消息 ID
 */
function removeThinkingMessage(msgId) {
    const msg = document.getElementById(msgId);
    if (msg) {
        msg.remove();
    }
}

/**
 * 解析消息中的 @标签 引用
 * @param {string} message - 用户输入的消息
 * @returns {Object} - { text: 处理后的消息, references: 引用数组 }
 */
function parseTagReferences(message) {
    const references = [];

    // 匹配 @开头的标签（支持中文和英文）
    const tagRegex = /@([\u4e00-\u9fa5\w]+)/g;
    let match;

    while ((match = tagRegex.exec(message)) !== null) {
        const tagName = match[1];

        // 在标签系统中查找对应元素
        if (typeof canvasElements !== 'undefined') {
            const element = canvasElements.find(el =>
                el.name === tagName || el.id === tagName
            );

            if (element) {
                references.push({
                    tag: `@${tagName}`,
                    elementId: element.id,
                    elementName: element.name,
                    hasContent: element.hasContent
                });
            }
        }
    }

    return {
        text: message,
        references: references
    };
}

/**
 * 生成预览图
 * @param {string} prompt - 生成提示词
 */
async function generatePreview(prompt) {
    const refImg = document.getElementById('ref-input');
    const prodImg = document.getElementById('prod-input');

    // 检查是否上传了图片
    if (!refImg.files || !refImg.files[0] || !prodImg.files || !prodImg.files[0]) {
        addChatMessage('system', '请先上传参考图和产品图');
        return;
    }

    // 显示预览生成提示
    addChatMessage('ai', '正在生成预览图，请稍候...');

    try {
        // 构建表单数据
        const formData = new FormData();
        formData.append('product_image', prodImg.files[0]);
        formData.append('reference_image', refImg.files[0]);
        formData.append('custom_prompt', prompt);

        // 调用预览 API
        const response = await fetch('/api/preview/generate', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success && data.preview_data) {
            // 显示预览图
            displayPreviewImage(data.preview_data, data.mime_type || 'image/png');
        } else {
            addChatMessage('system', `预览生成失败: ${data.message || '未知错误'}`);
        }

    } catch (error) {
        console.error('预览生成错误:', error);
        addChatMessage('system', `预览生成失败: ${error.message}`);
    }
}

/**
 * 在聊天中显示预览图
 * @param {string} base64Data - 预览图的 base64 数据
 * @param {string} mimeType - 图片 MIME 类型
 */
function displayPreviewImage(base64Data, mimeType) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai preview-message';

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    msgDiv.innerHTML = `
        <div class="message-bubble">
            <div class="preview-label">预览图</div>
            <div class="preview-image-container">
                <img src="data:${mimeType};base64,${base64Data}" alt="预览图" class="preview-image">
                <div class="preview-watermark">PREVIEW</div>
            </div>
            <div class="preview-actions">
                <button class="preview-action-btn regenerate-btn" onclick="regeneratePreview()">
                    🔄 重新预览
                </button>
                <button class="preview-action-btn apply-btn" onclick="applyPreview()">
                    ✅ 应用此预览（生成高清图）
                </button>
            </div>
            <div class="message-time">${time}</div>
        </div>
    `;

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;

    // 保存预览数据供后续使用
    window.lastPreviewPrompt = window.lastGeneratedPrompt || '';
}

/**
 * 重新生成预览
 */
window.regeneratePreview = async function() {
    if (window.lastPreviewPrompt) {
        await generatePreview(window.lastPreviewPrompt);
    } else {
        addChatMessage('system', '未找到上次的预览参数');
    }
};

/**
 * 应用预览并生成高清图
 */
window.applyPreview = function() {
    // 触发完整生成
    addChatMessage('user', '应用预览，生成高清图');
    sendChat({ message: "确认方案，开始生成高清图", final_trigger: true });
};

/**
 * 添加消息到聊天界面
 * @param {string} role - 消息角色: 'user' | 'ai' | 'system'
 * @param {string} text - 消息内容
 */
function addChatMessage(role, text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    // === 内容脱敏层 (物理抹除 AI 泄露的技术术语) ===
    let sanitizedText = text;
    if (role === 'ai') {
        // 1. 如果检测到长篇大论的代码样板，执行“静默替换”
        if (text.length > 200 && (text.includes('Role:') || text.includes('Subject:') || text.includes('Final'))) {
            sanitizedText = "⚡ 视觉方案已锁定，大师级渲染引擎启动中...";
        } else {
            // 2. 细粒度抹除泄露的技术术语
            const promptPatterns = [
                /Role:\s*.*?\./gi,
                /Subject:\s*.*?\./gi,
                /Mandatory:\s*.*?\./gi,
                /Typography\s*&\s*Text:\s*.*?\./gi,
                /Visual\s*Style:\s*.*?\./gi,
                /Environment\s*&\s*Scene:\s*.*?\./gi,
                /Final\s*Goal:\s*.*?\./gi,
                /BASE_PROMPT_TEMPLATE.*?;/gi,
                /Senior Architect/gi,
                /Core Subject/gi
            ];
            promptPatterns.forEach(pattern => {
                sanitizedText = sanitizedText.replace(pattern, '');
            });

            if (sanitizedText.trim().length < 5 && !sanitizedText.includes('[建议')) {
                sanitizedText = "好的，正在为您策划专业视觉方案...";
            }
        }
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. 提取建议并清理正文
    const suggestions = [];
    const suggestionRegex = /\[建议\d:\s*(.*?)\]/g;
    let cleanText = sanitizedText;

    const matches = [...sanitizedText.matchAll(suggestionRegex)];
    for (const m of matches) {
        suggestions.push(m[1]);
    }
    cleanText = cleanText.replace(suggestionRegex, '').trim();

    // 2. 高亮标签
    const formattedText = highlightTags(cleanText);

    msgDiv.innerHTML = `
        <div class="message-bubble">
            ${formattedText}
            ${role === 'ai' && suggestions.length > 0 ? `
                <div class="suggestion-box">
                    <div class="suggestion-title">💡 视觉策略建议</div>
                    <div class="suggestion-list">
                        ${suggestions.map(s => `
                            <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; width: 100%;">
                                <button class="suggestion-chip" style="flex: 1;" onclick="handleSuggestionClick('${s.replace(/'/g, "\\\'")}')">
                                    ${s}
                                </button>
                                <button class="suggestion-chip-icon" onclick="addAISuggestionToQueue('${s.replace(/'/g, "\\\'")}')}" title="加入队列">
                                    📋
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            ${role === 'ai' && (sanitizedText.includes('正在为您生成') || sanitizedText.includes('渲染图')) ? `
                <button class="confirm-gen-btn confirm-active" disabled>
                    🚀 任务处理中...
                </button>
            ` : role === 'ai' && !sanitizedText.includes('完毕') ? `
                <button class="confirm-gen-btn" onclick="handleFinalConfirm()">
                    🚀 方案已定，立即生成
                </button>
            ` : ''}
            <div class="message-time">${time}</div>
        </div>
    `;

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

/**
 * 处理建议碎片点击：发送消息并触发预览
 */
window.handleSuggestionClick = async function (text) {
    // 发送用户选择的建议
    sendChat({ message: text });
};

/**
 * 处理最终确认按钮：带上物理锁死信号
 */
window.handleFinalConfirm = function () {
    sendChat({ message: "好的，方案已定，开始生成！", final_trigger: true });
};

/**
 * 高亮消息中的 @标签
 * @param {string} text - 原始文本
 * @returns {string} - 带高亮的 HTML
 */
function highlightTags(text) {
    // 先处理换行
    let html = text.replace(/\n/g, '<br>');

    // 高亮 @标签
    html = html.replace(/@([\u4e00-\u9fa5\w]+)/g, '<span class="tag-highlight">@$1</span>');

    return html;
}

// 注入标签高亮样式
const chatStyleSheet = document.createElement('style');
chatStyleSheet.textContent = `
    .tag-highlight {
        background: rgba(10, 132, 255, 0.2);
        color: var(--accent-color);
        padding: 0.1rem 0.3rem;
        border-radius: 4px;
        font-weight: 500;
    }
`;
document.head.appendChild(chatStyleSheet);
