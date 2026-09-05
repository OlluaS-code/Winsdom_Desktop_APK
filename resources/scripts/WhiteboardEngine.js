class WhiteboardEngine {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    
    // Configurações de Traço
    this.tool = 'pen'; // 'pen' | 'eraser'
    this.strokeColor = '#1e293b';
    this.strokeSize = 3;

    // Pilhas do Command Pattern (Vetoriais)
    this.commands = [];
    this.undoneCommands = [];
    this.activeStroke = null;
    this.isDrawing = false;

    this.initDpiAwareCanvas();
    this.bindEvents();
  }

  initDpiAwareCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Resolução física do buffer
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    // Tamanho lógico no CSS
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    // Normalização das coordenadas de desenho
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

      // Recupera eventos coalescidos pelo driver da caneta/mouse
      const rawEvents = typeof e.getCoalescedEvents === 'function' 
        ? e.getCoalescedEvents() 
        : [e];

      for (const event of rawEvents) {
        const pt = this.getLogicalCoordinates(event);
        this.activeStroke.points.push(pt);

        // Renderização imediata do segmento
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
        this.undoneCommands = []; // Descarta pilha de refazer
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
    // Limpa tela considerando a resolução lógica
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;
    this.ctx.clearRect(0, 0, width, height);

    for (const cmd of this.commands) {
      if (cmd.type === 'text') {
        this.ctx.font = `${cmd.size}px Inter`;
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

      for (let i = 1; i < cmd.points.length; i++) {
        this.ctx.lineTo(cmd.points[i].x, cmd.points[i].y);
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
