/**
 * Motor vetorial 2D HiDPI com tratamento de eventos coalescidos e pilha de Undo/Redo limitada.
 */
class WhiteboardEngine {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');

    this.tool = 'pen';
    this.strokeColor = '#1e293b';
    this.strokeSize = 3;

    // Pilhas com limite de tamanho para conter consumo excessivo de memória RAM
    this.commands = [];
    this.undoneCommands = [];
    this.MAX_HISTORY = 40;

    this.activeStroke = null;
    this.isDrawing = false;
    this.dpr = window.devicePixelRatio || 1;

    this.initDpiAwareCanvas();
    this.bindEvents();
  }

  initDpiAwareCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.dpr = dpr;

    this.redrawAll();
  }

  bindEvents() {
    window.addEventListener('resize', () => this.initDpiAwareCanvas());

    this.canvas.addEventListener('pointerdown', (e) => {
      this.isDrawing = true;
      this.canvas.setPointerCapture(e.pointerId);

      const pos = this.getLogicalCoordinates(e);
      this.activeStroke = {
        tool: this.tool,
        color: this.tool === 'eraser' ? '#f8fafc' : this.strokeColor,
        size: this.tool === 'eraser' ? this.strokeSize * 4 : this.strokeSize,
        points: [pos]
      };

      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isDrawing || !this.activeStroke) return;

      const rawEvents = typeof e.getCoalescedEvents === 'function'
        ? e.getCoalescedEvents()
        : [e];

      for (let i = 0; i < rawEvents.length; i++) {
        const pt = this.getLogicalCoordinates(rawEvents[i]);
        this.activeStroke.points.push(pt);

        this.ctx.strokeStyle = this.activeStroke.color;
        this.ctx.lineWidth = this.activeStroke.size;
        this.ctx.lineTo(pt.x, pt.y);
        this.ctx.stroke();
      }
    });

    const endDraw = () => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      this.ctx.closePath();

      if (this.activeStroke && this.activeStroke.points.length > 0) {
        this.commands.push(this.activeStroke);
        if (this.commands.length > this.MAX_HISTORY) {
          this.commands.shift(); // Evita vazamento de memória liberando traços antigos
        }
        this.undoneCommands = [];
      }
      this.activeStroke = null;
    };

    this.canvas.addEventListener('pointerup', endDraw);
    this.canvas.addEventListener('pointercancel', endDraw);
  }

  getLogicalCoordinates(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  redrawAll() {
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;
    this.ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < this.commands.length; i++) {
      const cmd = this.commands[i];
      if (cmd.type === 'text') {
        this.ctx.font = `${cmd.size}px Inter, sans-serif`;
        this.ctx.fillStyle = cmd.color;
        this.ctx.textBaseline = "top";
        this.ctx.fillText(cmd.text, cmd.pos.x, cmd.pos.y);
        continue;
      }

      if (!cmd.points || cmd.points.length < 1) continue;

      this.ctx.beginPath();
      this.ctx.strokeStyle = cmd.color;
      this.ctx.lineWidth = cmd.size;
      this.ctx.moveTo(cmd.points[0].x, cmd.points[0].y);

      for (let j = 1; j < cmd.points.length; j++) {
        this.ctx.lineTo(cmd.points[j].x, cmd.points[j].y);
      }
      this.ctx.stroke();
      this.ctx.closePath();
    }
  }

  undo() {
    if (this.commands.length === 0) return;
    const removed = this.commands.pop();
    this.undoneCommands.push(removed);
    this.redrawAll();
  }

  redo() {
    if (this.undoneCommands.length === 0) return;
    const restored = this.undoneCommands.pop();
    this.commands.push(restored);
    this.redrawAll();
  }

  clear() {
    if (this.commands.length === 0) return;
    this.commands = [];
    this.undoneCommands = [];
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;
    this.ctx.clearRect(0, 0, width, height);
  }
}

window.WhiteboardEngine = WhiteboardEngine;
