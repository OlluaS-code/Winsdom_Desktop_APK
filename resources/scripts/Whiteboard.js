class WhiteboardUI {
    constructor() {
        this.canvas = document.getElementById('whiteboard');
        this.engine = new window.WhiteboardEngine(this.canvas);
        
        this.textInput = document.getElementById('text-input');
        this.textContainer = document.createElement('div');
        this.setupTextContainer();

        this.currentTool = 'pen';
        this.currentColor = '#1e293b';
        this.fontSize = 20;
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
        if (typeof lucide !== 'undefined') lucide.createIcons();
        
        // Let the engine handle drawing events
        // We only intercept text tool actions
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
        if (this.engine) this.engine.initDpiAwareCanvas();
    }

    setupTools() {
        document.querySelectorAll('[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.currentTool === 'text') this.finalizeText();
                document.querySelector('.tool-btn.active')?.classList.remove('active');
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
                
                // Update engine
                this.engine.tool = this.currentTool;
                if (this.currentTool === 'text') {
                    this.canvas.style.cursor = 'text';
                } else {
                    this.canvas.style.cursor = 'crosshair';
                }
            });
        });

        const sizeSlider = document.getElementById('font-size');
        if (sizeSlider) {
            sizeSlider.addEventListener('input', (e) => {
                this.fontSize = e.target.value;
                this.engine.strokeSize = parseInt(this.fontSize);
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
                this.engine.strokeColor = this.currentColor;
                this.textInput.style.color = this.currentColor;
                if(this.currentTool === 'eraser') document.querySelector('[data-tool="pen"]').click();
            });
        });
    }

    setupMenu() {
        const btn = document.getElementById('btn-edit');
        const menu = document.getElementById('menu-edit');
        if (btn && menu) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.toggle('show');
            });
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && !btn.contains(e.target)) menu.classList.remove('show');
            });
        }
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
            // Stop propagation so the engine doesn't start drawing lines for text clicks
            e.stopPropagation(); 
        }
    }

    handleGlobalMove(e) {
        if (this.isDraggingText) {
            this.textContainer.style.left = (e.clientX - this.offsetX) + 'px';
            this.textContainer.style.top = (e.clientY - this.offsetY) + 'px';
        }
    }

    stopAction() {
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
            const rect = this.textContainer.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            
            // Calculate logical position
            const logicalX = rect.left - canvasRect.left + 5;
            const logicalY = rect.top - canvasRect.top + 5;

            // Push text command to engine
            this.engine.commands.push({
                type: 'text',
                text: text,
                color: this.currentColor,
                size: this.fontSize,
                pos: { x: logicalX, y: logicalY }
            });
            this.engine.undoneCommands = [];
            this.engine.redrawAll();
        }
        this.textContainer.style.display = 'none';
    }

    undo() {
        this.engine.undo();
    }

    redo() {
        this.engine.redo();
    }

    clear() {
        this.engine.clear();
    }

    cut() {
        // stub
    }

    copy() {
        // stub
    }

    paste() {
        // stub
    }
}

// Global reference expected by UI onclicks in Math.html
window.app = new WhiteboardUI();
