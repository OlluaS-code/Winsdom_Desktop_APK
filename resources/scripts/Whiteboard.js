class Whiteboard {
    constructor() {
        this.canvas = document.getElementById('whiteboard');
        this.ctx = this.canvas.getContext('2d');
        this.textInput = document.getElementById('text-input');
        
        this.textContainer = document.createElement('div');
        this.setupTextContainer();

        this.isDrawing = false;
        this.currentTool = 'pen';
        this.currentColor = '#1e293b';
        this.currentSize = 3;
        this.fontSize = 20;
        
        this.history = [];
        this.redoStack = [];
        this.isDraggingText = false;
        
        this.init();
    }

    setupTextContainer() {
        this.textContainer.id = 'text-container-proxy';
        this.textContainer.style.cssText = `
            position: absolute; display: none; border: 2px dashed #0284c7;
            padding: 4px; cursor: move; z-index: 10000; background: rgba(255,255,255,0.2);
        `;
        document.getElementById('canvas-container').appendChild(this.textContainer);
        this.textContainer.appendChild(this.textInput);
        this.textInput.style.position = 'static';
        this.textInput.style.display = 'block';
    }

    init() {
        lucide.createIcons();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.canvas.addEventListener('mousedown', (e) => this.startAction(e));
        window.addEventListener('mousemove', (e) => this.handleGlobalMove(e));
        window.addEventListener('mouseup', () => this.stopAction());

        this.setupTools();
        this.setupColors();
        this.setupMenu();
        this.setupTextTool();
        this.setupKeyboardShortcuts();
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey)) {
                if (e.key === 'z') { e.preventDefault(); this.undo(); }
                if (e.key === 'y') { e.preventDefault(); this.redo(); }
            }
        });
    }

    resize() {
        const temp = this.ctx.getImageData(0,0,this.canvas.width, this.canvas.height);
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.putImageData(temp, 0, 0);
    }

    setupTools() {
        document.querySelectorAll('[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.currentTool === 'text') this.finalizeText();
                document.querySelector('.tool-btn.active')?.classList.remove('active');
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
            });
        });

        const sizeSlider = document.getElementById('font-size');
        if (sizeSlider) {
            sizeSlider.addEventListener('input', (e) => {
                this.fontSize = e.target.value;
                this.textInput.style.fontSize = this.fontSize + 'px';
                document.getElementById('size-label').innerText = this.fontSize + 'px';
            });
        }
    }

    setupColors() {
        document.querySelectorAll('.color-picker').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelector('.color-picker.active')?.classList.remove('active');
                btn.classList.add('active');
                this.currentColor = btn.dataset.color;
                this.textInput.style.color = this.currentColor;
                if(this.currentTool === 'eraser') document.querySelector('[data-tool="pen"]').click();
            });
        });
    }

    setupMenu() {
        const btn = document.getElementById('btn-edit');
        const menu = document.getElementById('menu-edit');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && !btn.contains(e.target)) menu.classList.remove('show');
        });
    }

    setupTextTool() {
        this.textContainer.onmousedown = (e) => {
            if (e.target === this.textContainer) {
                this.isDraggingText = true;
                this.offsetX = e.clientX - this.textContainer.offsetLeft;
                this.offsetY = e.clientY - this.textContainer.offsetTop;
            }
        };

        this.textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.finalizeText();
            }
        });
    }

    startAction(e) {
        if (this.currentTool === 'text') {
            if (this.textContainer.style.display === 'block') {
                this.finalizeText();
            } else {
                this.startText(e.clientX, e.clientY);
            }
            return;
        }
        this.isDrawing = true;
        this.saveState();
        this.ctx.beginPath();
        this.ctx.moveTo(e.clientX, e.clientY);
        this.ctx.strokeStyle = this.currentTool === 'eraser' ? '#f8fafc' : this.currentColor;
        this.ctx.lineWidth = this.currentTool === 'eraser' ? 40 : this.currentSize;
    }

    handleGlobalMove(e) {
        if (this.isDraggingText) {
            this.textContainer.style.left = (e.clientX - this.offsetX) + 'px';
            this.textContainer.style.top = (e.clientY - this.offsetY) + 'px';
        } else if (this.isDrawing) {
            this.ctx.lineTo(e.clientX, e.clientY);
            this.ctx.stroke();
        }
    }

    stopAction() {
        this.isDrawing = false;
        this.isDraggingText = false;
    }

    startText(x, y) {
        this.textContainer.style.display = 'block';
        this.textContainer.style.left = x + 'px';
        this.textContainer.style.top = y + 'px';
        this.textInput.style.fontSize = this.fontSize + 'px';
        this.textInput.style.color = this.currentColor;
        this.textInput.value = '';
        setTimeout(() => this.textInput.focus(), 10);
    }

    finalizeText() {
        const text = this.textInput.value.trim();
        if (text && this.textContainer.style.display === 'block') {
            this.saveState();
            this.ctx.font = `${this.fontSize}px Inter`;
            this.ctx.fillStyle = this.currentColor;
            const rect = this.textContainer.getBoundingClientRect();
            this.ctx.fillText(text, rect.left + 5, rect.top + parseInt(this.fontSize) + 2);
        }
        this.textContainer.style.display = 'none';
    }

    saveState() {
        this.history.push(this.ctx.getImageData(0,0,this.canvas.width, this.canvas.height));
        if (this.history.length > 50) this.history.shift();
        this.redoStack = [];
    }

    undo() {
        if (this.history.length > 0) {
            this.redoStack.push(this.ctx.getImageData(0,0,this.canvas.width, this.canvas.height));
            this.ctx.putImageData(this.history.pop(), 0, 0);
        }
    }

    redo() {
        if (this.redoStack.length > 0) {
            this.history.push(this.ctx.getImageData(0,0,this.canvas.width, this.canvas.height));
            this.ctx.putImageData(this.redoStack.pop(), 0, 0);
        }
    }

    clear() {
        this.saveState();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

window.app = new Whiteboard();
