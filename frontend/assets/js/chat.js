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
            <span class="thinking-animation">思考中</span>
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
                            <button class="suggestion-chip" onclick="handleSuggestionClick('${s.replace(/'/g, "\\\'")}')">
                                ${s}
                            </button>
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
 * 处理建议碎片点击：填入并发送
 */
window.handleSuggestionClick = function (text) {
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
        .tag - highlight {
        background: rgba(var(--accent - color - rgb, 99, 102, 241), 0.2);
        color: var(--accent - color);
        padding: 0.1rem 0.3rem;
        border - radius: 4px;
        font - weight: 500;
    }
    `;
document.head.appendChild(chatStyleSheet);
