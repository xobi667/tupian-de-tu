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
        this._rafId = null;
        this._resizeObserver = null;
        this._currentImg = null;
        this._windowResizeHandler = null;
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
        this.scheduleUpdateOverlayBounds();
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

    getAnnotations() {
        return this.annotations.map(a => ({ ...a }));
    }

    renderAnnotations() {
        this.scheduleUpdateOverlayBounds();
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

    scheduleUpdateOverlayBounds() {
        const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 16));
        if (this._rafId) return;
        this._rafId = raf(() => {
            this._rafId = null;
            this.updateOverlayBounds();
        });
    }

    attachToImage(img) {
        if (!img) return;
        if (this._currentImg === img) return;

        if (this._currentImg && this._resizeObserver) {
            try {
                this._resizeObserver.unobserve(this._currentImg);
            } catch (e) {}
        }

        this._currentImg = img;
        img.addEventListener('load', () => this.scheduleUpdateOverlayBounds(), { once: true });
        this.scheduleUpdateOverlayBounds();

        if (this._resizeObserver) {
            this._resizeObserver.observe(img);
        }
    }

    observeImages() {
        if (window.ResizeObserver) {
            this._resizeObserver = new ResizeObserver(() => this.scheduleUpdateOverlayBounds());
            this._resizeObserver.observe(this.imageContainer);
        } else {
            this._windowResizeHandler = () => this.scheduleUpdateOverlayBounds();
            window.addEventListener('resize', this._windowResizeHandler);
        }

        const img = this.imageContainer.querySelector('img');
        if (img) this.attachToImage(img);

        const observer = new MutationObserver(() => {
            const newImg = this.imageContainer.querySelector('img');
            if (newImg) this.attachToImage(newImg);
            this.scheduleUpdateOverlayBounds();
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

        const baseW = this.imageContainer.clientWidth || containerRect.width || 1;
        const baseH = this.imageContainer.clientHeight || containerRect.height || 1;
        const scaleX = containerRect.width ? (containerRect.width / baseW) : 1;
        const scaleY = containerRect.height ? (containerRect.height / baseH) : 1;

        const safeScaleX = scaleX || 1;
        const safeScaleY = scaleY || 1;
        const left = (imgRect.left - containerRect.left) / safeScaleX;
        const top = (imgRect.top - containerRect.top) / safeScaleY;
        const width = imgRect.width / safeScaleX;
        const height = imgRect.height / safeScaleY;

        this.overlay.style.display = this.isEnabled ? 'block' : 'none';
        this.overlay.style.position = 'absolute';
        this.overlay.style.left = `${left}px`;
        this.overlay.style.top = `${top}px`;
        this.overlay.style.width = `${width}px`;
        this.overlay.style.height = `${height}px`;
    }

    clampPercent(value) {
        if (isNaN(value)) return 0;
        return Math.min(100, Math.max(0, value));
    }
}

window.CanvasAnnotator = CanvasAnnotator;
