/**
 * Xobi Chat History Manager
 * 管理聊天历史记录、Prompt 复用、Reopen 功能
 */

class ChatHistoryManager {
    constructor() {
        this.storageKey = 'xobi_chat_history';
        this.maxHistorySize = 30; // 最多保存 30 条历史
        this.sessions = this.loadSessions();
    }

    /**
     * 从 localStorage 加载历史记录
     */
    loadSessions() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('[ChatHistory] 加载历史记录失败:', e);
            return [];
        }
    }

    /**
     * 保存历史记录到 localStorage
     */
    saveSessions() {
        try {
            // 只保留最近的记录
            const trimmed = this.sessions.slice(0, this.maxHistorySize);
            localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
            console.log(`[ChatHistory] 已保存 ${trimmed.length} 条历史记录`);
        } catch (e) {
            console.error('[ChatHistory] 保存历史记录失败:', e);
        }
    }

    /**
     * 添加新的会话记录
     * @param {Object} session - 会话数据
     * @param {Array} session.messages - 对话消息历史
     * @param {string} session.finalPrompt - 最终生成的 Prompt
     * @param {string} session.imageData - 生成的图片 base64（可选）
     * @param {string} session.productName - 产品名称（可选）
     * @param {Object} session.params - 生成参数（quality, aspect_ratio）
     * @param {Array} session.annotations - 画布标注数据（可选）
     */
    addSession(session) {
        const newSession = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            messages: session.messages || [],
            finalPrompt: session.finalPrompt || '',
            imageData: session.imageData || null,
            productName: session.productName || '未命名产品',
            params: session.params || { quality: '1K', aspect_ratio: '1:1' },
            annotations: session.annotations || [],
            // 摘要（用于显示在历史列表）
            summary: this.generateSummary(session.messages)
        };

        // 添加到列表开头
        this.sessions.unshift(newSession);

        // 保存到 localStorage
        this.saveSessions();

        console.log('[ChatHistory] 新增会话记录:', newSession.id);
        return newSession.id;
    }

    /**
     * 生成会话摘要（提取第一条用户消息）
     */
    generateSummary(messages) {
        if (!messages || messages.length === 0) return '空会话';

        // 找到第一条用户消息
        const firstUserMsg = messages.find(m => m.role === 'user');
        if (firstUserMsg) {
            const text = firstUserMsg.parts?.[0]?.text || firstUserMsg.content || '';
            // 截取前 30 个字符
            return text.substring(0, 30) + (text.length > 30 ? '...' : '');
        }

        return '新会话';
    }

    /**
     * 获取所有历史记录
     */
    getAllSessions() {
        return this.sessions;
    }

    /**
     * 根据 ID 获取单个会话
     */
    getSession(sessionId) {
        return this.sessions.find(s => s.id === sessionId);
    }

    /**
     * 删除指定会话
     */
    deleteSession(sessionId) {
        const index = this.sessions.findIndex(s => s.id === sessionId);
        if (index !== -1) {
            this.sessions.splice(index, 1);
            this.saveSessions();
            console.log('[ChatHistory] 已删除会话:', sessionId);
            return true;
        }
        return false;
    }

    /**
     * 清空所有历史记录
     */
    clearAll() {
        if (confirm('确定要清空所有历史记录吗？此操作不可恢复。')) {
            this.sessions = [];
            this.saveSessions();
            console.log('[ChatHistory] 已清空所有历史记录');
            return true;
        }
        return false;
    }

    /**
     * Reopen 功能：重新应用历史 Prompt
     * @param {number} sessionId - 会话 ID
     * @returns {Object|null} - 会话数据
     */
    reopen(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) {
            console.error('[ChatHistory] 未找到会话:', sessionId);
            return null;
        }

        console.log('[ChatHistory] Reopen 会话:', sessionId, session);
        return session;
    }

    /**
     * 导出历史记录为 JSON 文件
     */
    exportToFile() {
        const dataStr = JSON.stringify(this.sessions, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `xobi-chat-history-${Date.now()}.json`;
        link.click();

        URL.revokeObjectURL(url);
        console.log('[ChatHistory] 已导出历史记录');
    }

    /**
     * 从文件导入历史记录
     */
    importFromFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (Array.isArray(imported)) {
                    this.sessions = imported;
                    this.saveSessions();
                    console.log('[ChatHistory] 已导入历史记录:', imported.length);
                    // 刷新 UI
                    if (typeof renderHistoryUI === 'function') {
                        renderHistoryUI();
                    }
                } else {
                    alert('导入失败：文件格式不正确');
                }
            } catch (err) {
                alert('导入失败：' + err.message);
            }
        };
        reader.readAsText(file);
    }
}

// 全局实例
const chatHistoryManager = new ChatHistoryManager();

/**
 * 在生成成功后保存会话
 * 从 single.js 或 batch.js 调用
 */
window.saveChatSession = function(imageData, finalPrompt, params = {}) {
    if (typeof chatHistory === 'undefined') {
        console.warn('[ChatHistory] chatHistory 未定义，跳过保存');
        return;
    }

    // Get annotations from annotator if available
    let annotations = [];
    if (typeof annotator !== 'undefined' && annotator) {
        annotations = annotator.getAnnotations();
    }

    const sessionId = chatHistoryManager.addSession({
        messages: chatHistory,
        finalPrompt: finalPrompt,
        imageData: imageData,
        productName: params.productName || '产品',
        params: {
            quality: params.quality || '1K',
            aspect_ratio: params.aspect_ratio || '1:1'
        },
        annotations: annotations
    });

    console.log('[ChatHistory] 会话已保存:', sessionId);

    // 刷新历史记录 UI（如果存在）
    if (typeof renderHistoryUI === 'function') {
        renderHistoryUI();
    }

    return sessionId;
};

/**
 * Reopen 历史 Prompt 并触发生成
 */
window.reopenSession = function(sessionId) {
    const session = chatHistoryManager.reopen(sessionId);
    if (!session) {
        alert('无法找到该历史记录');
        return;
    }

    // 恢复对话历史
    if (typeof chatHistory !== 'undefined') {
        chatHistory = [...session.messages];
    }

    // 恢复标注数据
    if (session.annotations && session.annotations.length > 0 && typeof annotator !== 'undefined' && annotator) {
        annotator.loadAnnotations(session.annotations);
        if (typeof addChatMessage === 'function') {
            addChatMessage('system', `📍 已恢复 ${session.annotations.length} 个标注点`);
        }
    }

    // 显示提示
    if (typeof addChatMessage === 'function') {
        addChatMessage('system', `📌 已恢复会话: ${session.summary}`);
        addChatMessage('system', `📝 Final Prompt: ${session.finalPrompt.substring(0, 100)}...`);
    }

    // 直接触发生成
    if (typeof sendChat === 'function') {
        sendChat({
            message: session.finalPrompt,
            final_trigger: true
        });
    }
};

/**
 * 渲染历史记录 UI
 */
window.renderHistoryUI = function() {
    const container = document.getElementById('history-list');
    if (!container) return;

    const sessions = chatHistoryManager.getAllSessions();

    if (sessions.length === 0) {
        container.innerHTML = '<div class="history-empty">暂无历史记录</div>';
        return;
    }

    container.innerHTML = sessions.map(session => {
        const date = new Date(session.timestamp);
        const timeStr = date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="history-item" data-session-id="${session.id}">
                <div class="history-header">
                    <span class="history-time">${timeStr}</span>
                    <button class="history-delete" onclick="deleteHistorySession(${session.id})" title="删除">
                        ✕
                    </button>
                </div>
                <div class="history-summary">${session.summary}</div>
                <div class="history-params">
                    <span class="param-tag">${session.params.quality}</span>
                    <span class="param-tag">${session.params.aspect_ratio}</span>
                    ${session.annotations && session.annotations.length > 0 ?
                        `<span class="param-tag">📍 ${session.annotations.length} 个标注</span>` : ''}
                </div>
                ${session.imageData ? `
                    <div class="history-preview">
                        <img src="data:image/png;base64,${session.imageData}" alt="preview">
                    </div>
                ` : ''}
                <button class="history-reopen-btn" onclick="reopenSession(${session.id})">
                    🔄 Reopen
                </button>
            </div>
        `;
    }).join('');
};

/**
 * 删除历史记录
 */
window.deleteHistorySession = function(sessionId) {
    if (chatHistoryManager.deleteSession(sessionId)) {
        renderHistoryUI();
    }
};

/**
 * 清空所有历史记录
 */
window.clearAllHistory = function() {
    if (chatHistoryManager.clearAll()) {
        renderHistoryUI();
    }
};

/**
 * 导出历史记录
 */
window.exportHistory = function() {
    chatHistoryManager.exportToFile();
};

/**
 * 导入历史记录
 */
window.importHistory = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            chatHistoryManager.importFromFile(file);
        }
    };
    input.click();
};

console.log('[ChatHistory] 历史记录管理器已加载');
