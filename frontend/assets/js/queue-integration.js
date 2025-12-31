/**
 * Queue Integration Helper Functions
 *
 * 功能：
 * - 将聊天中的任务添加到队列
 * - 提供"加入队列"按钮
 * - 快速添加当前配置的任务
 */

/**
 * 快速添加当前配置到队列
 */
window.addCurrentTaskToQueue = function() {
    if (!singleRefFile || !singleProdFile) {
        alert('请先上传参考图和产品图');
        return;
    }

    const params = getSelectedParams();
    const productName = document.getElementById('prod-name').value || '产品';
    const customPrompt = document.getElementById('custom-text').value || '';

    const task = {
        type: 'generation',
        params: {
            referenceImage: singleRefFile,
            productImage: singleProdFile,
            productName: productName,
            customPrompt: customPrompt,
            quality: params.quality,
            aspectRatio: params.ratio
        },
        priority: 0
    };

    const taskId = taskQueue.addTask(task);

    // 显示成功提示
    if (typeof addChatMessage === 'function') {
        addChatMessage('system', `✅ 任务已添加到队列 (${productName} - ${params.quality} - ${params.ratio})`);
    }

    log('success', '任务已添加到队列');

    // 更新队列徽章
    updateQueueBadge();

    return taskId;
};

/**
 * 从 AI 建议添加任务到队列
 */
window.addAISuggestionToQueue = function(suggestion) {
    if (!singleRefFile || !singleProdFile) {
        alert('请先上传参考图和产品图');
        return;
    }

    const params = getSelectedParams();
    const productName = document.getElementById('prod-name').value || '产品';

    const task = {
        type: 'generation',
        params: {
            referenceImage: singleRefFile,
            productImage: singleProdFile,
            productName: productName,
            customPrompt: suggestion,
            quality: params.quality,
            aspectRatio: params.ratio
        },
        priority: 0
    };

    const taskId = taskQueue.addTask(task);

    if (typeof addChatMessage === 'function') {
        addChatMessage('system', `✅ AI 建议已添加到队列: ${suggestion.substring(0, 50)}...`);
    }

    log('success', 'AI 建议已添加到队列');
    updateQueueBadge();

    return taskId;
};

/**
 * 批量添加多个配置到队列
 */
window.addBatchTasksToQueue = function(configs) {
    if (!Array.isArray(configs) || configs.length === 0) {
        return;
    }

    let addedCount = 0;

    configs.forEach(config => {
        const task = {
            type: 'generation',
            params: {
                referenceImage: config.referenceImage || singleRefFile,
                productImage: config.productImage || singleProdFile,
                productName: config.productName || '产品',
                customPrompt: config.customPrompt || '',
                quality: config.quality || '1K',
                aspectRatio: config.aspectRatio || '1:1'
            },
            priority: config.priority || 0
        };

        taskQueue.addTask(task);
        addedCount++;
    });

    if (typeof addChatMessage === 'function') {
        addChatMessage('system', `✅ 已批量添加 ${addedCount} 个任务到队列`);
    }

    log('success', `批量添加了 ${addedCount} 个任务到队列`);
    updateQueueBadge();
};

/**
 * 更新队列徽章显示
 */
function updateQueueBadge() {
    if (!taskQueue) return;

    const badge = document.getElementById('queue-toggle-badge');
    const pendingCount = taskQueue.queue.filter(t => t.status === 'pending').length;

    if (badge) {
        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

/**
 * 创建"加入队列"按钮（用于聊天建议）
 */
window.createAddToQueueButton = function(suggestion) {
    return `
        <button class="add-to-queue-btn" onclick="addAISuggestionToQueue('${suggestion.replace(/'/g, "\\'")}')">
            📋 加入队列
        </button>
    `;
};

/**
 * 批量创建预设任务（不同画质和比例的组合）
 */
window.createPresetTasks = function() {
    if (!singleRefFile || !singleProdFile) {
        alert('请先上传参考图和产品图');
        return;
    }

    const productName = document.getElementById('prod-name').value || '产品';
    const customPrompt = document.getElementById('custom-text').value || '';

    const qualities = ['1K', '2K', '4K'];
    const ratios = ['1:1', '3:4', '16:9'];

    const configs = [];

    qualities.forEach(quality => {
        ratios.forEach(ratio => {
            configs.push({
                productName: productName,
                customPrompt: customPrompt,
                quality: quality,
                aspectRatio: ratio,
                priority: 0
            });
        });
    });

    addBatchTasksToQueue(configs);

    if (typeof addChatMessage === 'function') {
        addChatMessage('system', `✅ 已创建 ${configs.length} 个预设任务 (${qualities.length} 种画质 × ${ratios.length} 种比例)`);
    }
};

/**
 * 智能队列建议 - 根据当前参数生成推荐配置
 */
window.suggestQueueTasks = function() {
    if (!singleRefFile || !singleProdFile) {
        if (typeof addChatMessage === 'function') {
            addChatMessage('ai', '请先上传参考图和产品图，我可以帮您创建多个优化任务加入队列。');
        }
        return;
    }

    const productName = document.getElementById('prod-name').value || '产品';

    const suggestions = [
        {
            name: '高清展示版',
            prompt: '4K 超清画质，适合详情页大图展示',
            quality: '4K',
            ratio: '3:4'
        },
        {
            name: '移动端优化版',
            prompt: '竖屏比例，适合手机端浏览',
            quality: '2K',
            ratio: '9:16'
        },
        {
            name: '主图标准版',
            prompt: '正方形，适合电商平台主图',
            quality: '2K',
            ratio: '1:1'
        },
        {
            name: '横幅广告版',
            prompt: '宽屏，适合 Banner 广告位',
            quality: '2K',
            ratio: '16:9'
        }
    ];

    if (typeof addChatMessage === 'function') {
        const suggestionHtml = suggestions.map(s => `
            <div style="margin-bottom: 0.5rem;">
                <strong>${s.name}</strong> (${s.quality} - ${s.ratio})
                <br>
                <span style="font-size: 0.85rem; color: var(--text-secondary);">${s.prompt}</span>
            </div>
        `).join('');

        addChatMessage('ai', `
我为您推荐以下 ${suggestions.length} 种配置方案：

${suggestionHtml}

<button class="suggestion-chip" onclick="addSmartQueueTasks()">
    一键添加全部到队列
</button>
        `);
    }
};

/**
 * 添加智能推荐任务到队列
 */
window.addSmartQueueTasks = function() {
    const productName = document.getElementById('prod-name').value || '产品';
    const customPrompt = document.getElementById('custom-text').value || '';

    const configs = [
        {
            productName: productName,
            customPrompt: customPrompt || '4K 超清画质，适合详情页大图展示',
            quality: '4K',
            aspectRatio: '3:4',
            priority: 1
        },
        {
            productName: productName,
            customPrompt: customPrompt || '竖屏比例，适合手机端浏览',
            quality: '2K',
            aspectRatio: '9:16',
            priority: 2
        },
        {
            productName: productName,
            customPrompt: customPrompt || '正方形，适合电商平台主图',
            quality: '2K',
            aspectRatio: '1:1',
            priority: 3
        },
        {
            productName: productName,
            customPrompt: customPrompt || '宽屏，适合 Banner 广告位',
            quality: '2K',
            aspectRatio: '16:9',
            priority: 4
        }
    ];

    addBatchTasksToQueue(configs);
};

/**
 * 监听队列变化，自动更新徽章
 */
if (typeof window !== 'undefined') {
    // 每秒检查一次队列状态
    setInterval(() => {
        updateQueueBadge();
    }, 1000);
}

/**
 * 快捷键支持
 */
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+Q 打开队列面板
        if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
            e.preventDefault();
            if (taskQueue) {
                taskQueue.toggleQueuePanel();
            }
        }

        // Ctrl+Shift+A 添加当前任务到队列
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            addCurrentTaskToQueue();
        }
    });
});
