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
 */
async function sendChat() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const msg = input.value.trim();
    if (!msg) return;

    // 解析消息中的 @标签 引用
    const parsedMessage = parseTagReferences(msg);

    // 乐观更新 UI - 显示用户消息
    addChatMessage('user', msg);
    input.value = '';

    // === 关键词检测：用户确认开始 ===
    const confirmKeywords = ['开始', '好的', '可以', 'ok', 'OK', '好', '确认', '执行', '生成', 'start', '开始吧', '来吧'];
    const isConfirmation = confirmKeywords.some(kw => msg.includes(kw));

    if (isConfirmation) {
        // 直接触发生图，不需要等 AI 回复
        addChatMessage('ai', '正在处理，请稍候...');

        // 触发生图函数
        if (typeof startSingleGen === 'function') {
            startSingleGen();
        } else if (typeof startBatchJob === 'function') {
            startBatchJob();
        }
        return;  // 不再调用 AI
    }

    // 添加到历史记录（用户消息）
    chatHistory.push({
        role: "user",
        parts: [{ text: parsedMessage.text }]
    });

    // === 显示等待状态 ===
    setChatLoading(true);

    // 显示 AI 思考中的占位消息
    const thinkingId = showThinkingMessage();

    try {
        // 构建请求体
        const payload = {
            message: parsedMessage.text,
            job_id: typeof currentBatchId !== 'undefined' ? currentBatchId : null,
            history: chatHistory,
            references: parsedMessage.references
        };

        const data = await Api.post('/api/chat/', payload);

        // 移除思考中消息
        removeThinkingMessage(thinkingId);

        if (data.response) {
            // === 过滤 AI 回复：如果是英文或太长，用中文替换 ===
            let aiReply = data.response;
            const isEnglish = /^[a-zA-Z\s\*\-\.\,\:\;\!\?\(\)\[\]\"\'\`\n\r]+$/.test(aiReply.trim().substring(0, 50));
            const isTooLong = aiReply.length > 150;

            if (isEnglish || isTooLong) {
                // 替换为简洁中文回复
                aiReply = '好的，已理解您的需求。可以开始处理吗？';
            }

            addChatMessage('ai', aiReply);

            // 添加到历史记录（AI 回复）
            chatHistory.push({
                role: "model",
                parts: [{ text: aiReply }]
            });
        }

        // 处理 AI 返回的动作
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
        else if (data.action === 'start_job') {
            // 触发任务开始
            if (typeof startBatchJob === 'function') {
                startBatchJob();
            } else if (typeof startSingleGen === 'function') {
                startSingleGen();
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
 */
function setChatLoading(loading) {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    if (input) {
        input.disabled = loading;
        input.placeholder = loading ? 'AI 思考中...' : '输入消息...';
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

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;

    // 格式化时间
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 高亮 @标签
    const formattedText = highlightTags(text);

    msgDiv.innerHTML = `
        <div class="message-bubble">
            ${formattedText}
        </div>
        <div class="message-time">${time}</div>
    `;

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

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
        background: rgba(var(--accent-color-rgb, 99, 102, 241), 0.2);
        color: var(--accent-color);
        padding: 0.1rem 0.3rem;
        border-radius: 4px;
        font-weight: 500;
    }
`;
document.head.appendChild(chatStyleSheet);
