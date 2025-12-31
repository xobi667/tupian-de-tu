/**
 * 简洁标注层，支持点击添加/编辑/删除标注点。
 * 依赖：页面上存在指定的 imageContainer 元素，并含有 <img>。
 */
class CanvasAnnotator {
    constructor(imageContainerId, options = {}) {
        this.imageContainer = document.getElementById(imageContainerId);
        if (!this.imageContainer) {
            console.warn('[CanvasAnnotator] 未找到容器:', imageContainerId);
            return;
        }

        this.annotations = [];
        this.nextId = 1;
        this.isEnabled = false;
        this.onAnnotationAdd = options.onAnnotationAdd || (() => {});
        this.onAnnotationDelete = options.onAnnotationDelete || (() => {});
        this.onAnnotationUpdate = options.onAnnotationUpdate || (() => {});

        this.overlay = this.createOverlay();
        this.bindEvents();
        this.observeImages();
    }

    createOverlay() {
        this.imageContainer.style.position = this.imageContainer.style.position || 'relative';
        const overlay = document.createElement('div');
        overlay.className = 'annotation-overlay';
        overlay.style.display = 'none';
        this.imageContainer.appendChild(overlay);
        return overlay;
    }

    bindEvents() {
        this.overlay.addEventListener('click', (e) => {
            if (!this.isEnabled) return;
            const rect = this.overlay.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            const annotation = this.addAnnotation(x, y);
            this.promptAnnotationText(annotation);
        });
    }

    enable() {
        this.isEnabled = true;
        this.updateOverlayBounds();
        this.overlay.style.display = 'block';
        this.imageContainer.classList.add('annotation-mode');
    }

    disable() {
        this.isEnabled = false;
        this.overlay.style.display = 'none';
        this.imageContainer.classList.remove('annotation-mode');
    }

    toggle() {
        if (this.isEnabled) {
            this.disable();
        } else {
            this.enable();
        }
    }

    addAnnotation(x, y, text = '') {
        const annotation = {
            id: this.nextId++,
            x: this.clampPercent(x),
            y: this.clampPercent(y),
            text,
            status: 'pending'
        };
        this.annotations.push(annotation);
        this.renderAnnotations();
        this.onAnnotationAdd(annotation);
        return annotation;
    }

    updateAnnotation(id, text) {
        const annotation = this.annotations.find(a => a.id === id);
        if (annotation) {
            annotation.text = text;
            this.renderAnnotations();
            this.onAnnotationUpdate(annotation);
        }
    }

    deleteAnnotation(id) {
        const index = this.annotations.findIndex(a => a.id === id);
        if (index !== -1) {
            const annotation = this.annotations[index];
            this.annotations.splice(index, 1);
            this.renderAnnotations();
            this.onAnnotationDelete(annotation);
        }
    }

    clearAnnotations() {
        this.annotations = [];
        this.renderAnnotations();
    }

    renderAnnotations() {
        this.updateOverlayBounds();
        this.overlay.innerHTML = '';

        this.annotations.forEach((annotation, index) => {
            const marker = this.createMarker(annotation, index + 1);
            this.overlay.appendChild(marker);
        });
    }

    createMarker(annotation, number) {
        const marker = document.createElement('div');
        marker.className = `annotation-marker annotation-${annotation.status}`;
        marker.style.left = `${this.clampPercent(annotation.x)}%`;
        marker.style.top = `${this.clampPercent(annotation.y)}%`;
        marker.setAttribute('data-id', annotation.id);

        const dot = document.createElement('div');
        dot.className = 'marker-dot';
        const num = document.createElement('div');
        num.className = 'marker-number';
        num.textContent = number;
        marker.appendChild(dot);
        marker.appendChild(num);

        if (annotation.text) {
            const tip = document.createElement('div');
            tip.className = 'marker-tooltip';
            tip.textContent = annotation.text;
            marker.appendChild(tip);
        }

        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            this.promptAnnotationText(annotation);
        });

        return marker;
    }

    promptAnnotationText(annotation) {
        const text = window.prompt('输入修改需求，例如：把这里的背景改成蓝色', annotation.text || '');
        if (text === null) return;
        const trimmed = text.trim();
        if (!trimmed) {
            this.deleteAnnotation(annotation.id);
        } else {
            this.updateAnnotation(annotation.id, trimmed);
        }
    }

    observeImages() {
        const apply = () => this.updateOverlayBounds();
        const img = this.imageContainer.querySelector('img');
        if (img) {
            img.addEventListener('load', apply, { once: true });
            apply();
        }
        const observer = new MutationObserver(() => {
            const newImg = this.imageContainer.querySelector('img');
            if (newImg) {
                newImg.addEventListener('load', apply, { once: true });
                apply();
            }
        });
        observer.observe(this.imageContainer, { childList: true, subtree: true });
        this.imageObserver = observer;
    }

    updateOverlayBounds() {
        const img = this.imageContainer.querySelector('img');
        if (!img) {
            this.overlay.style.display = 'none';
            return;
        }
        const containerRect = this.imageContainer.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();
        this.overlay.style.display = this.isEnabled ? 'block' : 'none';
        this.overlay.style.position = 'absolute';
        this.overlay.style.left = `${imgRect.left - containerRect.left}px`;
        this.overlay.style.top = `${imgRect.top - containerRect.top}px`;
        this.overlay.style.width = `${imgRect.width}px`;
        this.overlay.style.height = `${imgRect.height}px`;
    }

    clampPercent(value) {
        if (isNaN(value)) return 0;
        return Math.min(100, Math.max(0, value));
    }
}

window.CanvasAnnotator = CanvasAnnotator;
