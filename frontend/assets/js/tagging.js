/**
 * Xobi 标签系统 (Tagging System)
 * 
 * 实现类似 Lovart.ai 的标签交互：
 * 1. Ctrl + 左键点击画布元素 → 自动插入 @标签 到聊天框
 * 2. 在聊天框输入 @ → 显示可选元素菜单
 */

// ========== 全局状态 ==========

// 存储所有可引用的画布元素
let canvasElements = [];

// 当前是否有内容已上传（控制发送按钮状态）
let hasUploadedContent = false;

// ========== 初始化 ==========

/**
 * 初始化标签系统
 * 扫描页面中所有带有 data-element-id 的元素并注册事件
 */
function initTagging() {
    console.log('[Tagging] 初始化标签系统...');

    // 扫描所有画布元素
    scanCanvasElements();

    // 注册 Ctrl+Click 事件
    registerCtrlClickHandler();

    // 注册 @ 提及输入事件
    registerMentionHandler();

    console.log(`[Tagging] 已注册 ${canvasElements.length} 个可引用元素`);
}

/**
 * 扫描页面中所有可引用的画布元素
 */
function scanCanvasElements() {
    canvasElements = [];

    // 查找所有带有 data-element-id 的元素
    const elements = document.querySelectorAll('[data-element-id]');

    elements.forEach((el, index) => {
        const elementData = {
            id: el.dataset.elementId,           // 元素唯一标识
            name: el.dataset.elementName || `元素${index + 1}`,  // 显示名称
            type: el.dataset.elementType || 'image',  // 元素类型
            domElement: el,                     // DOM 引用
            hasContent: false                   // 是否已有内容
        };

        canvasElements.push(elementData);
    });
}

// ========== Ctrl + Click 处理 ==========

/**
 * 注册 Ctrl+Click 事件处理器
 * 当用户按住 Ctrl 并点击画布元素时，将其引用插入聊天框
 * 使用捕获阶段 + stopImmediatePropagation 确保拦截所有点击
 */
function registerCtrlClickHandler() {
    // 为每个画布元素添加点击监听（捕获阶段，优先级最高）
    canvasElements.forEach(elementData => {
        const el = elementData.domElement;

        // 使用捕获阶段监听，确保在其他事件之前执行
        el.addEventListener('click', (event) => {
            // 检查是否按住了 Ctrl 键
            if (event.ctrlKey) {
                // 彻底阻止事件传播和默认行为
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                // 插入标签到聊天框
                insertTagToChat(elementData);

                // 显示视觉反馈
                showTagFeedback(el, elementData.name);

                console.log(`[Tagging] Ctrl+Click 插入标签: @${elementData.name}`);
                return false;  // 额外保险
            }
        }, true);  // true = 捕获阶段

        // 同时监听 mousedown，更早拦截
        el.addEventListener('mousedown', (event) => {
            if (event.ctrlKey) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, true);

        // 添加视觉提示（Ctrl 按下时改变光标）
        el.addEventListener('mouseenter', (event) => {
            if (event.ctrlKey) {
                el.style.cursor = 'crosshair';
                el.style.outline = '2px solid var(--accent-color)';
            }
        });

        el.addEventListener('mouseleave', () => {
            el.style.cursor = '';
            el.style.outline = '';
        });
    });

    // 全局监听 Ctrl 键状态
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Control') {
            document.body.classList.add('ctrl-pressed');
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.key === 'Control') {
            document.body.classList.remove('ctrl-pressed');
            // 移除所有元素的高亮
            canvasElements.forEach(data => {
                data.domElement.style.cursor = '';
                data.domElement.style.outline = '';
            });
        }
    });
}

/**
 * 将标签插入到聊天输入框
 * @param {Object} elementData - 元素数据对象
 */
function insertTagToChat(elementData) {
    const chatInput = document.getElementById('chat-input');
    if (!chatInput) return;

    const tagText = `@${elementData.name} `;

    // 获取当前光标位置
    const cursorPos = chatInput.selectionStart;
    const textBefore = chatInput.value.substring(0, cursorPos);
    const textAfter = chatInput.value.substring(cursorPos);

    // 插入标签
    chatInput.value = textBefore + tagText + textAfter;

    // 移动光标到标签后
    const newPos = cursorPos + tagText.length;
    chatInput.setSelectionRange(newPos, newPos);

    // 聚焦输入框
    chatInput.focus();
}

/**
 * 显示标签插入的视觉反馈
 * @param {HTMLElement} element - 被点击的元素
 * @param {string} name - 元素名称
 */
function showTagFeedback(element, name) {
    // 创建浮动提示
    const feedback = document.createElement('div');
    feedback.className = 'tag-feedback';
    feedback.textContent = `已引用 @${name}`;
    feedback.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--accent-color);
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 500;
        z-index: 9999;
        animation: tagFeedbackAnim 0.8s ease-out forwards;
    `;

    document.body.appendChild(feedback);

    // 动画结束后移除
    setTimeout(() => {
        feedback.remove();
    }, 800);

    // 元素闪烁效果
    element.style.transition = 'box-shadow 0.2s ease';
    element.style.boxShadow = '0 0 20px var(--accent-color)';
    setTimeout(() => {
        element.style.boxShadow = '';
    }, 300);
}

// ========== @ 提及菜单 ==========

/**
 * 注册 @ 提及输入事件
 * 当用户在聊天框输入 @ 时显示可选元素菜单
 */
function registerMentionHandler() {
    const chatInput = document.getElementById('chat-input');
    const mentionMenu = document.getElementById('mention-menu');

    if (!chatInput || !mentionMenu) {
        console.warn('[Tagging] 未找到聊天输入框或提及菜单');
        return;
    }

    let currentMentionIndex = 0;  // 当前选中的菜单项索引

    chatInput.addEventListener('input', (e) => {
        const value = chatInput.value;
        const cursorPos = chatInput.selectionStart;

        // 查找光标前最近的 @ 符号位置
        const textBeforeCursor = value.substring(0, cursorPos);
        const atIndex = textBeforeCursor.lastIndexOf('@');

        if (atIndex !== -1) {
            // 获取 @ 后面的搜索词
            const searchTerm = textBeforeCursor.substring(atIndex + 1).toLowerCase();

            // 过滤匹配的元素
            const filteredElements = canvasElements.filter(el =>
                el.name.toLowerCase().includes(searchTerm) ||
                el.id.toLowerCase().includes(searchTerm)
            );

            if (filteredElements.length > 0) {
                showMentionMenu(filteredElements, atIndex);
                currentMentionIndex = 0;
                highlightMentionItem(currentMentionIndex);
            } else {
                hideMentionMenu();
            }
        } else {
            hideMentionMenu();
        }
    });

    // 键盘导航
    chatInput.addEventListener('keydown', (e) => {
        if (mentionMenu.style.display === 'none') return;

        const items = mentionMenu.querySelectorAll('.mention-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentMentionIndex = Math.min(currentMentionIndex + 1, items.length - 1);
            highlightMentionItem(currentMentionIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentMentionIndex = Math.max(currentMentionIndex - 1, 0);
            highlightMentionItem(currentMentionIndex);
        } else if (e.key === 'Enter' && items.length > 0) {
            e.preventDefault();
            items[currentMentionIndex].click();
        } else if (e.key === 'Escape') {
            hideMentionMenu();
        }
    });

    // 点击外部关闭菜单
    document.addEventListener('click', (e) => {
        if (!mentionMenu.contains(e.target) && e.target !== chatInput) {
            hideMentionMenu();
        }
    });
}

/**
 * 显示 @ 提及菜单
 * @param {Array} elements - 要显示的元素列表
 * @param {number} atIndex - @ 符号在输入框中的位置
 */
function showMentionMenu(elements, atIndex) {
    const mentionMenu = document.getElementById('mention-menu');
    if (!mentionMenu) return;

    // 构建菜单内容
    mentionMenu.innerHTML = elements.map((el, index) => `
        <div class="mention-item" data-element-id="${el.id}" data-at-index="${atIndex}">
            <span class="icon">${getElementIcon(el.type)}</span>
            <div>
                <div class="name">@${el.name}</div>
                <div class="desc">${el.hasContent ? '已上传' : '未上传'}</div>
            </div>
        </div>
    `).join('');

    // 绑定点击事件
    mentionMenu.querySelectorAll('.mention-item').forEach(item => {
        item.addEventListener('click', () => {
            selectMentionItem(item);
        });
    });

    mentionMenu.style.display = 'block';
}

/**
 * 隐藏 @ 提及菜单
 */
function hideMentionMenu() {
    const mentionMenu = document.getElementById('mention-menu');
    if (mentionMenu) {
        mentionMenu.style.display = 'none';
    }
}

/**
 * 高亮指定索引的菜单项
 * @param {number} index - 菜单项索引
 */
function highlightMentionItem(index) {
    const mentionMenu = document.getElementById('mention-menu');
    if (!mentionMenu) return;

    const items = mentionMenu.querySelectorAll('.mention-item');
    items.forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
}

/**
 * 选择菜单项，将标签插入输入框
 * @param {HTMLElement} item - 被选中的菜单项
 */
function selectMentionItem(item) {
    const chatInput = document.getElementById('chat-input');
    const elementId = item.dataset.elementId;
    const atIndex = parseInt(item.dataset.atIndex);

    // 查找元素数据
    const elementData = canvasElements.find(el => el.id === elementId);
    if (!elementData) return;

    // 替换 @ 及其后面的搜索词为完整标签
    const value = chatInput.value;
    const cursorPos = chatInput.selectionStart;

    const textBefore = value.substring(0, atIndex);
    const textAfter = value.substring(cursorPos);
    const tagText = `@${elementData.name} `;

    chatInput.value = textBefore + tagText + textAfter;

    // 移动光标
    const newPos = atIndex + tagText.length;
    chatInput.setSelectionRange(newPos, newPos);
    chatInput.focus();

    hideMentionMenu();
}

/**
 * 根据元素类型返回对应图标
 * @param {string} type - 元素类型
 * @returns {string} - 表情符号图标
 */
function getElementIcon(type) {
    const icons = {
        'image': '🖼️',
        'product': '🛍️',
        'result': '✨',
        'text': '📝',
        'layer': '📑'
    };
    return icons[type] || '📦';
}

// ========== 上传状态管理 ==========

/**
 * 更新元素的上传状态
 * @param {string} elementId - 元素 ID
 * @param {boolean} hasContent - 是否已有内容
 */
function updateElementStatus(elementId, hasContent) {
    const element = canvasElements.find(el => el.id === elementId);
    if (element) {
        element.hasContent = hasContent;
    }

    // 检查是否有任何内容已上传
    checkUploadStatus();
}

/**
 * 检查整体上传状态，控制聊天发送按钮
 */
function checkUploadStatus() {
    hasUploadedContent = canvasElements.some(el => el.hasContent);

    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatHint = document.getElementById('chat-hint');

    if (chatInput && chatSendBtn) {
        chatInput.disabled = !hasUploadedContent;
        chatSendBtn.disabled = !hasUploadedContent;

        if (chatHint) {
            chatHint.style.display = hasUploadedContent ? 'none' : 'block';
        }
    }
}

// ========== CSS 动画注入 ==========

// 注入标签反馈动画样式
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes tagFeedbackAnim {
        0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.8);
        }
        20% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }
        80% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }
        100% {
            opacity: 0;
            transform: translate(-50%, -60%) scale(0.9);
        }
    }
    
    /* Ctrl 按下时画布元素的样式 */
    body.ctrl-pressed .canvas-element {
        cursor: crosshair !important;
    }
    
    body.ctrl-pressed .canvas-element:hover {
        outline: 2px dashed var(--accent-color) !important;
        outline-offset: 2px;
    }
`;
document.head.appendChild(styleSheet);
