/**
 * Task Queue Manager - 任务队列系统
 *
 * 功能：
 * - 管理多个标注/修改/生成任务
 * - 串行执行任务避免 API 并发限制
 * - 任务状态跟踪（pending, processing, completed, failed）
 * - 失败重试机制
 * - 拖拽排序功能
 * - 队列数据持久化到 localStorage
 */

class TaskQueueManager {
    constructor() {
        this.queue = [];
        this.isRunning = false;
        this.isPaused = false;
        this.currentTaskIndex = -1;
        this.maxRetries = 3;

        // 从 localStorage 加载队列
        this.loadFromStorage();

        // 初始化 UI
        this.initUI();
    }

    /**
     * 添加任务到队列
     * @param {Object} task - 任务对象
     */
    addTask(task) {
        const newTask = {
            id: Date.now() + Math.random(),
            type: task.type || 'generation',
            params: task.params || {},
            status: 'pending',
            result: null,
            error: null,
            retryCount: 0,
            createdAt: new Date().toISOString(),
            priority: task.priority || 0
        };

        this.queue.push(newTask);
        this.saveToStorage();
        this.renderQueue();

        log('info', `任务已添加到队列 (ID: ${newTask.id})`);

        // 显示队列面板
        this.showQueuePanel();

        return newTask.id;
    }

    /**
     * 删除任务
     * @param {string|number} taskId - 任务 ID
     */
    removeTask(taskId) {
        const index = this.queue.findIndex(t => t.id === taskId);
        if (index !== -1) {
            const task = this.queue[index];

            // 不能删除正在执行的任务
            if (task.status === 'processing') {
                alert('无法删除正在执行的任务');
                return false;
            }

            this.queue.splice(index, 1);
            this.saveToStorage();
            this.renderQueue();
            log('info', `任务已从队列移除 (ID: ${taskId})`);
            return true;
        }
        return false;
    }

    /**
     * 清空队列
     */
    clearQueue() {
        if (this.isRunning) {
            if (!confirm('队列正在运行，确定要清空吗？')) {
                return;
            }
            this.stopQueue();
        }

        this.queue = [];
        this.currentTaskIndex = -1;
        this.saveToStorage();
        this.renderQueue();
        log('info', '队列已清空');
    }

    /**
     * 批量执行所有任务
     */
    async runAll() {
        if (this.isRunning) {
            log('warning', '队列正在运行中...');
            return;
        }

        const pendingTasks = this.queue.filter(t => t.status === 'pending' || t.status === 'failed');
        if (pendingTasks.length === 0) {
            alert('没有待执行的任务');
            return;
        }

        this.isRunning = true;
        this.isPaused = false;
        this.updateControlButtons();

        log('success', `开始批量执行 ${pendingTasks.length} 个任务...`);

        for (let i = 0; i < this.queue.length; i++) {
            if (this.isPaused) {
                log('info', '队列已暂停');
                break;
            }

            const task = this.queue[i];

            // 只执行 pending 或 failed 的任务
            if (task.status === 'pending' || task.status === 'failed') {
                this.currentTaskIndex = i;
                await this.executeTask(task);

                // 任务间延迟 1 秒，避免 API 频率限制
                if (i < this.queue.length - 1) {
                    await this.sleep(1000);
                }
            }
        }

        this.isRunning = false;
        this.currentTaskIndex = -1;
        this.updateControlButtons();

        // 显示执行结果汇总
        this.showSummary();
    }

    /**
     * 执行单个任务
     * @param {string|number} taskId - 任务 ID
     */
    async runTask(taskId) {
        const task = this.queue.find(t => t.id === taskId);
        if (!task) {
            log('error', '任务不存在');
            return;
        }

        if (this.isRunning) {
            log('warning', '队列正在运行中，请等待完成');
            return;
        }

        this.isRunning = true;
        this.updateControlButtons();

        await this.executeTask(task);

        this.isRunning = false;
        this.updateControlButtons();
    }

    /**
     * 暂停队列执行
     */
    pauseQueue() {
        if (!this.isRunning) {
            return;
        }
        this.isPaused = true;
        log('info', '队列已暂停，当前任务执行完成后停止');
        this.updateControlButtons();
    }

    /**
     * 恢复队列执行
     */
    resumeQueue() {
        if (!this.isRunning || !this.isPaused) {
            return;
        }
        this.isPaused = false;
        log('info', '队列已恢复执行');
        this.updateControlButtons();

        // 继续执行剩余任务
        this.runAll();
    }

    /**
     * 停止队列执行
     */
    stopQueue() {
        this.isRunning = false;
        this.isPaused = false;
        this.currentTaskIndex = -1;
        this.updateControlButtons();
        log('info', '队列已停止');
    }

    /**
     * 执行任务的核心逻辑
     * @param {Object} task - 任务对象
     */
    async executeTask(task) {
        task.status = 'processing';
        task.startTime = Date.now();
        this.renderQueue();

        log('info', `正在执行任务 ${task.id}...`);

        try {
            let result;

            // 根据任务类型调用不同的 API
            switch (task.type) {
                case 'generation':
                    result = await this.executeGeneration(task);
                    break;
                case 'annotation':
                    result = await this.executeAnnotation(task);
                    break;
                case 'modification':
                    result = await this.executeModification(task);
                    break;
                default:
                    throw new Error(`未知的任务类型: ${task.type}`);
            }

            task.status = 'completed';
            task.result = result;
            task.error = null;
            task.completedAt = new Date().toISOString();
            task.duration = Date.now() - task.startTime;

            log('success', `任务 ${task.id} 执行成功 (耗时: ${(task.duration / 1000).toFixed(1)}s)`);

        } catch (error) {
            const errorMsg = error.message || String(error);

            // 如果重试次数未达上限，标记为待重试
            if (task.retryCount < this.maxRetries) {
                task.retryCount++;
                task.status = 'pending';
                task.error = `${errorMsg} (重试 ${task.retryCount}/${this.maxRetries})`;
                log('warning', `任务 ${task.id} 失败，将进行第 ${task.retryCount} 次重试`);

                // 延迟 2 秒后重试
                await this.sleep(2000);
                return await this.executeTask(task);

            } else {
                task.status = 'failed';
                task.error = errorMsg;
                log('error', `任务 ${task.id} 失败: ${errorMsg}`);
            }
        }

        this.saveToStorage();
        this.renderQueue();
    }

    /**
     * 执行图片生成任务
     */
    async executeGeneration(task) {
        const params = task.params;

        // 构建 FormData
        const formData = new FormData();

        if (params.referenceImage) {
            formData.append('reference_image', params.referenceImage);
        }
        if (params.productImage) {
            formData.append('product_image', params.productImage);
        }

        formData.append('product_name', params.productName || '产品');
        if (params.customPrompt) {
            formData.append('custom_text', params.customPrompt);
        }
        formData.append('quality', params.quality || '1K');
        formData.append('aspect_ratio', params.aspectRatio || '1:1');
        if (params.platform) formData.append('platform', params.platform);
        if (params.imageType) formData.append('image_type', params.imageType);
        if (params.imageStyle) formData.append('image_style', params.imageStyle);
        if (params.backgroundType) formData.append('background_type', params.backgroundType);
        if (params.language) formData.append('language', params.language);

        // 调用 API（使用 300s 超时）
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('生成请求超时 (300s)')), 300000)
        );

        const apiPromise = Api.post('/api/replace/single', formData, true);
        const data = await Promise.race([apiPromise, timeoutPromise]);

        if (data.success && data.image_data) {
            return {
                imageData: data.image_data,
                type: 'image'
            };
        } else {
            throw new Error(data.error || '生成失败');
        }
    }

    /**
     * 执行标注任务
     */
    async executeAnnotation(task) {
        // 标注任务的具体实现
        const params = task.params;

        // 这里可以调用标注相关的 API
        // 暂时返回模拟结果
        return {
            annotationData: params.annotation,
            type: 'annotation'
        };
    }

    /**
     * 执行修改任务
     */
    async executeModification(task) {
        // 修改任务的具体实现
        const params = task.params;

        // 调用聊天 API 处理修改请求
        const payload = {
            message: params.prompt || '执行修改',
            job_id: params.jobId || null,
            history: [],
            quality: params.quality || '1K',
            aspect_ratio: params.aspectRatio || '1:1',
            final_trigger: true
        };

        const data = await Api.post('/api/chat/', payload);

        return {
            response: data.response,
            action: data.action,
            type: 'modification'
        };
    }

    /**
     * 调整任务优先级（拖拽排序）
     * @param {number} fromIndex - 原位置
     * @param {number} toIndex - 目标位置
     */
    reorderTask(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;

        const [task] = this.queue.splice(fromIndex, 1);
        this.queue.splice(toIndex, 0, task);

        this.saveToStorage();
        this.renderQueue();
        log('info', '任务顺序已调整');
    }

    /**
     * 渲染队列 UI
     */
    renderQueue() {
        const container = document.getElementById('task-queue-list');
        if (!container) return;

        if (this.queue.length === 0) {
            container.innerHTML = `
                <div class="queue-empty">
                    <div class="queue-empty-icon">📋</div>
                    <div class="queue-empty-text">队列为空</div>
                    <div class="queue-empty-hint">添加标注或修改任务到队列</div>
                </div>
            `;
            this.updateQueueStats();
            return;
        }

        container.innerHTML = this.queue.map((task, index) => `
            <div class="task-item ${task.status}"
                 data-task-id="${task.id}"
                 data-index="${index}"
                 draggable="true">
                <div class="task-header">
                    <div class="task-status-indicator ${task.status}">
                        ${this.getStatusIcon(task.status)}
                    </div>
                    <div class="task-info">
                        <div class="task-title">
                            ${this.getTaskTitle(task)}
                        </div>
                        <div class="task-meta">
                            ${this.getTaskMeta(task)}
                        </div>
                    </div>
                    <div class="task-actions">
                        ${task.status === 'pending' || task.status === 'failed' ? `
                            <button class="task-action-btn" onclick="taskQueue.runTask(${task.id})" title="运行此任务">
                                ▶
                            </button>
                        ` : ''}
                        ${task.status !== 'processing' ? `
                            <button class="task-action-btn delete" onclick="taskQueue.removeTask(${task.id})" title="删除任务">
                                ✕
                            </button>
                        ` : ''}
                    </div>
                </div>
                ${task.error ? `
                    <div class="task-error">
                        ⚠ ${task.error}
                    </div>
                ` : ''}
                ${task.status === 'completed' && task.result ? `
                    <div class="task-result">
                        ${this.renderTaskResult(task)}
                    </div>
                ` : ''}
                ${task.status === 'processing' ? `
                    <div class="task-progress">
                        <div class="task-progress-bar">
                            <div class="task-progress-fill"></div>
                        </div>
                        <div class="task-progress-text">处理中...</div>
                    </div>
                ` : ''}
            </div>
        `).join('');

        // 更新统计信息
        this.updateQueueStats();

        // 初始化拖拽
        this.initDragAndDrop();
    }

    /**
     * 获取任务状态图标
     */
    getStatusIcon(status) {
        const icons = {
            pending: '⏳',
            processing: '⚙',
            completed: '✓',
            failed: '✕'
        };
        return icons[status] || '?';
    }

    /**
     * 获取任务标题
     */
    getTaskTitle(task) {
        const types = {
            generation: '图片生成',
            annotation: '标注处理',
            modification: '修改任务'
        };

        const typeText = types[task.type] || task.type;
        const params = task.params;

        if (task.type === 'generation' && params.productName) {
            return `${typeText} - ${params.productName}`;
        } else if (task.type === 'modification' && params.prompt) {
            return `${typeText} - ${params.prompt.substring(0, 30)}...`;
        }

        return typeText;
    }

    /**
     * 获取任务元信息
     */
    getTaskMeta(task) {
        const parts = [];
        const params = task.params;

        if (params.quality) {
            parts.push(params.quality);
        }
        if (params.aspectRatio) {
            parts.push(params.aspectRatio);
        }

        if (task.status === 'completed' && task.duration) {
            parts.push(`${(task.duration / 1000).toFixed(1)}s`);
        }

        return parts.join(' · ') || 'ID: ' + task.id;
    }

    /**
     * 渲染任务结果
     */
    renderTaskResult(task) {
        const result = task.result;

        if (result.type === 'image' && result.imageData) {
            return `
                <img src="data:image/png;base64,${result.imageData}"
                     class="task-result-image"
                     onclick="taskQueue.viewResult(${task.id})">
            `;
        } else if (result.response) {
            return `<div class="task-result-text">${result.response}</div>`;
        }

        return '<div class="task-result-text">执行成功</div>';
    }

    /**
     * 查看任务结果
     */
    viewResult(taskId) {
        const task = this.queue.find(t => t.id === taskId);
        if (!task || !task.result) return;

        if (task.result.type === 'image' && task.result.imageData) {
            // 在结果区域显示图片
            const resArea = document.getElementById('single-result');
            if (resArea) {
                resArea.innerHTML = `<img src="data:image/png;base64,${task.result.imageData}" style="border-radius:12px; max-height:100%;">`;
                resArea.classList.add('has-image');

                // 显示下载按钮
                const dlBtn = document.getElementById('single-dl-btn');
                if (dlBtn) {
                    dlBtn.style.display = 'inline-flex';
                    dlBtn.onclick = () => {
                        const a = document.createElement('a');
                        a.href = `data:image/png;base64,${task.result.imageData}`;
                        a.download = `xobi_queue_${task.id}.png`;
                        a.click();
                    };
                }

                log('success', '结果已显示在生成区域');
            }
        }
    }

    /**
     * 更新队列统计信息
     */
    updateQueueStats() {
        const stats = {
            total: this.queue.length,
            pending: this.queue.filter(t => t.status === 'pending').length,
            processing: this.queue.filter(t => t.status === 'processing').length,
            completed: this.queue.filter(t => t.status === 'completed').length,
            failed: this.queue.filter(t => t.status === 'failed').length
        };

        const statsEl = document.getElementById('queue-stats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="queue-stat">
                    <span class="queue-stat-label">总计</span>
                    <span class="queue-stat-value">${stats.total}</span>
                </div>
                <div class="queue-stat">
                    <span class="queue-stat-label">待处理</span>
                    <span class="queue-stat-value pending">${stats.pending}</span>
                </div>
                <div class="queue-stat">
                    <span class="queue-stat-label">进行中</span>
                    <span class="queue-stat-value processing">${stats.processing}</span>
                </div>
                <div class="queue-stat">
                    <span class="queue-stat-label">已完成</span>
                    <span class="queue-stat-value completed">${stats.completed}</span>
                </div>
                <div class="queue-stat">
                    <span class="queue-stat-label">失败</span>
                    <span class="queue-stat-value failed">${stats.failed}</span>
                </div>
            `;
        }

        // 更新面板标题的进度
        const headerStats = document.getElementById('queue-header-stats');
        if (headerStats) {
            if (this.isRunning && stats.total > 0) {
                headerStats.textContent = `${stats.completed}/${stats.total} 已完成`;
            } else if (stats.total > 0) {
                headerStats.textContent = `${stats.total} 个任务`;
            } else {
                headerStats.textContent = '';
            }
        }
    }

    /**
     * 更新控制按钮状态
     */
    updateControlButtons() {
        const runAllBtn = document.getElementById('queue-run-all-btn');
        const pauseBtn = document.getElementById('queue-pause-btn');
        const stopBtn = document.getElementById('queue-stop-btn');
        const clearBtn = document.getElementById('queue-clear-btn');

        if (runAllBtn) {
            runAllBtn.disabled = this.isRunning || this.queue.length === 0;
            runAllBtn.textContent = this.isRunning ? '运行中...' : '运行全部';
        }

        if (pauseBtn) {
            pauseBtn.style.display = this.isRunning && !this.isPaused ? 'inline-flex' : 'none';
        }

        if (stopBtn) {
            stopBtn.style.display = this.isRunning ? 'inline-flex' : 'none';
        }

        if (clearBtn) {
            clearBtn.disabled = this.isRunning;
        }
    }

    /**
     * 显示执行结果汇总
     */
    showSummary() {
        const completed = this.queue.filter(t => t.status === 'completed').length;
        const failed = this.queue.filter(t => t.status === 'failed').length;
        const total = this.queue.length;

        const message = `
队列执行完成！

总任务数: ${total}
成功: ${completed}
失败: ${failed}
成功率: ${((completed / total) * 100).toFixed(1)}%
        `.trim();

        alert(message);
        log('success', `队列执行完成 (${completed}/${total} 成功)`);
    }

    /**
     * 初始化 UI
     */
    initUI() {
        // UI 将在 HTML 中定义，这里只做事件绑定
        // 确保 DOM 加载完成后执行
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.bindEvents());
        } else {
            this.bindEvents();
        }
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 队列面板切换
        const toggleBtn = document.getElementById('queue-toggle-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleQueuePanel());
        }

        // 控制按钮
        const runAllBtn = document.getElementById('queue-run-all-btn');
        if (runAllBtn) {
            runAllBtn.addEventListener('click', () => this.runAll());
        }

        const pauseBtn = document.getElementById('queue-pause-btn');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this.pauseQueue());
        }

        const stopBtn = document.getElementById('queue-stop-btn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopQueue());
        }

        const clearBtn = document.getElementById('queue-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm('确定要清空队列吗？')) {
                    this.clearQueue();
                }
            });
        }
    }

    /**
     * 切换队列面板显示
     */
    toggleQueuePanel() {
        const panel = document.getElementById('task-queue-panel');
        if (!panel) return;

        if (panel.style.display === 'none' || !panel.style.display) {
            this.showQueuePanel();
        } else {
            this.hideQueuePanel();
        }
    }

    /**
     * 显示队列面板
     */
    showQueuePanel() {
        const panel = document.getElementById('task-queue-panel');
        if (panel) {
            panel.style.display = 'flex';
            this.renderQueue();
            document.body.classList.add('queue-panel-visible');
        }
    }

    /**
     * 隐藏队列面板
     */
    hideQueuePanel() {
        const panel = document.getElementById('task-queue-panel');
        if (panel) {
            panel.style.display = 'none';
            document.body.classList.remove('queue-panel-visible');
        }
    }

    /**
     * 初始化拖拽排序
     */
    initDragAndDrop() {
        const items = document.querySelectorAll('.task-item');
        let draggedItem = null;

        items.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                draggedItem = null;
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                const afterElement = this.getDragAfterElement(item.parentElement, e.clientY);
                if (afterElement == null) {
                    item.parentElement.appendChild(draggedItem);
                } else {
                    item.parentElement.insertBefore(draggedItem, afterElement);
                }
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();

                const fromIndex = parseInt(draggedItem.dataset.index);
                const toIndex = parseInt(item.dataset.index);

                this.reorderTask(fromIndex, toIndex);
            });
        });
    }

    /**
     * 获取拖拽后的插入位置
     */
    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    /**
     * 保存队列到 localStorage
     */
    saveToStorage() {
        try {
            // 只保存必要的数据，排除 File 对象
            const queueData = this.queue.map(task => ({
                ...task,
                params: {
                    ...task.params,
                    // 移除 File 对象（无法序列化）
                    referenceImage: null,
                    productImage: null
                }
            }));

            localStorage.setItem('xobi_task_queue', JSON.stringify(queueData));
        } catch (e) {
            console.error('保存队列失败:', e);
        }
    }

    /**
     * 从 localStorage 加载队列
     */
    loadFromStorage() {
        try {
            const data = localStorage.getItem('xobi_task_queue');
            if (data) {
                this.queue = JSON.parse(data);
                // 重置所有 processing 状态为 pending（页面刷新后）
                this.queue.forEach(task => {
                    if (task.status === 'processing') {
                        task.status = 'pending';
                    }
                });
            }
        } catch (e) {
            console.error('加载队列失败:', e);
            this.queue = [];
        }
    }

    /**
     * 工具函数：延迟
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 导出队列配置
     */
    exportQueue() {
        const data = JSON.stringify(this.queue, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `xobi_queue_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        log('success', '队列配置已导出');
    }

    /**
     * 导入队列配置
     */
    importQueue() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (Array.isArray(data)) {
                        this.queue = data;
                        this.saveToStorage();
                        this.renderQueue();
                        log('success', `已导入 ${data.length} 个任务`);
                    } else {
                        throw new Error('无效的队列数据格式');
                    }
                } catch (error) {
                    alert('导入失败: ' + error.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
}

// 创建全局实例
let taskQueue;

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        taskQueue = new TaskQueueManager();
    });
} else {
    taskQueue = new TaskQueueManager();
}
