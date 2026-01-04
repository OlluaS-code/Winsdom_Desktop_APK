lucide.createIcons();

function switchTab(tabId) {
  document
    .querySelectorAll(".tab-content")
    .forEach((el) => el.classList.add("hidden"));
  document
    .querySelectorAll(".tab-content")
    .forEach((el) => el.classList.remove("block"));
  document
    .querySelectorAll(".nav-btn-tab")
    .forEach((el) => el.classList.remove("active-tab"));

  const tab = document.getElementById(tabId);
  tab.classList.remove("hidden");
  tab.classList.add("block");
  document.getElementById(`btn-${tabId}`).classList.add("active-tab");

  if (tabId === "mindmap") setTimeout(resizeMindMap, 10);
  if (tabId === "whiteboard") setTimeout(wbApp.resize, 10);
}

if (window.winsdom) {
  window.winsdom.onMenuAction((action) => {
    switch (action) {
      case "mindmap":
        if (typeof switchTab === "function") {
          switchTab("mindmap");
        } else {
          document.getElementById("btn-mindmap").click();
        }
        break;

      case "flashcards":
        if (typeof switchTab === "function") {
          switchTab("flashcards");
        } else {
          document.getElementById("btn-flashcards").click();
        }
        break;

      case "glossary":
        if (typeof switchTab === "function") {
          switchTab("glossary");
        } else {
          document.getElementById("btn-glossary").click();
        }
        break;

      case "whiteboard":
        if (typeof switchTab === "function") {
          switchTab("whiteboard");
        } else {
          document.getElementById("btn-whiteboard").click();
        }
        break;
    }
  });

  window.winsdom.onExportPDF(() => {
    window.print();
  });
}

function toggleModal(id) {
  const el = document.getElementById(id);
  if (el.classList.contains("hidden")) {
    el.classList.remove("hidden");
    el.style.display = "flex";
    if (id === "fc-modal") {
      document.getElementById("fc-front").value = "";
      document.getElementById("fc-back").value = "";
      document.getElementById("fc-front").focus();
    }
    if (id === "gl-modal") {
      document.getElementById("gl-term").value = "";
      document.getElementById("gl-def").value = "";
      document.getElementById("gl-term").focus();
    }
  } else {
    el.classList.add("hidden");
    setTimeout(() => (el.style.display = "none"), 200);
  }
}

const wbApp = {
  canvas: document.getElementById("wb-canvas"),
  ctx: null,
  textProxy: document.getElementById("text-container-proxy"),
  textInput: document.getElementById("text-input"),

  tool: "pen",
  color: "#1e293b",
  size: 20,
  isDrawing: false,
  history: [],
  historyStep: -1,

  init() {
    this.ctx = this.canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());

    this.canvas.addEventListener("mousedown", (e) => this.startDraw(e));
    this.canvas.addEventListener("mousemove", (e) => this.draw(e));
    this.canvas.addEventListener("mouseup", () => this.stopDraw());
    this.canvas.addEventListener("mouseout", () => this.stopDraw());

    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        this.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        this.redo();
      }
    });

    this.textInput.addEventListener("blur", () => this.finishText());
    this.textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.textInput.blur();
      }
    });

    this.saveState();
  },

  resize() {
    const parent = this.canvas.parentElement;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext("2d");
    if (this.canvas.width > 0) tempCtx.drawImage(this.canvas, 0, 0);

    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;

    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.drawImage(tempCanvas, 0, 0);
  },

  setTool(toolName) {
    this.tool = toolName;
    document
      .querySelectorAll(".tool-btn")
      .forEach((b) => b.classList.remove("active"));
    document.querySelector(`[data-tool="${toolName}"]`).classList.add("active");

    if (toolName === "text") this.canvas.style.cursor = "text";
    else this.canvas.style.cursor = "crosshair";
  },

  setColor(colorCode, element) {
    this.color = colorCode;
    document
      .querySelectorAll(".color-picker")
      .forEach((c) => c.classList.remove("active"));
    element.classList.add("active");
  },

  setSize(val) {
    this.size = parseInt(val);
    document.getElementById("size-label").innerText = val + "px";
  },

  startDraw(e) {
    if (this.tool === "text") {
      this.startText(e);
      return;
    }
    this.isDrawing = true;
    this.ctx.beginPath();
    const { x, y } = this.getPos(e);
    this.ctx.moveTo(x, y);
  },

  draw(e) {
    if (!this.isDrawing || this.tool === "text") return;
    const { x, y } = this.getPos(e);

    this.ctx.lineWidth = this.tool === "eraser" ? this.size * 2 : this.size / 5;
    this.ctx.strokeStyle = this.tool === "eraser" ? "#f8fafc" : this.color;

    this.ctx.lineTo(x, y);
    this.ctx.stroke();
  },

  stopDraw() {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.ctx.closePath();
      this.saveState();
    }
  },

  startText(e) {
    const { x, y } = this.getPos(e);

    this.textProxy.style.display = "block";
    this.textProxy.style.left = x + "px";
    this.textProxy.style.top = y + "px";

    this.textInput.value = "";
    this.textInput.style.color = this.color;
    this.textInput.style.fontSize = this.size + "px";
    this.textInput.style.minWidth = this.size * 2 + "px";
    this.textInput.style.height = this.size * 1.5 + "px";

    setTimeout(() => this.textInput.focus(), 10);
  },

  finishText() {
    if (this.textProxy.style.display === "none") return;

    const text = this.textInput.value;
    if (text.trim() !== "") {
      const x = parseInt(this.textProxy.style.left);
      const y = parseInt(this.textProxy.style.top);
      const fontSize = parseInt(this.textInput.style.fontSize);

      this.ctx.font = `${fontSize}px Inter`;
      this.ctx.fillStyle = this.textInput.style.color;
      this.ctx.textBaseline = "top";
      this.ctx.fillText(text, x, y);
      this.saveState();
    }

    this.textProxy.style.display = "none";
  },

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  },

  saveState() {
    if (this.historyStep < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyStep + 1);
    }
    this.history.push(this.canvas.toDataURL());
    this.historyStep++;
  },

  undo() {
    if (this.historyStep > 0) {
      this.historyStep--;
      this.restoreState();
    }
  },

  redo() {
    if (this.historyStep < this.history.length - 1) {
      this.historyStep++;
      this.restoreState();
    }
  },

  restoreState() {
    const img = new Image();
    img.src = this.history[this.historyStep];
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0);
    };
  },

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.saveState();
    this.toggleMenu();
  },

  toggleMenu() {
    document.getElementById("menu-edit").classList.toggle("show");
  },
};

wbApp.init();

const mmCanvas = document.getElementById("mm-canvas");
const mmCtx = mmCanvas.getContext("2d");
let nodes = JSON.parse(localStorage.getItem("mm_nodes")) || [
  {
    id: 1,
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    text: "Biologia",
    parent: null,
    color: "#4f46e5",
  },
];
let draggingNode = null;
let isDragging = false;
let dragOffsetX = 0,
  dragOffsetY = 0;
let offset = { x: 0, y: 0 };
let isPanning = false,
  startPan = { x: 0, y: 0 };

function resizeMindMap() {
  const container = document.getElementById("mindmap");
  mmCanvas.width = container.clientWidth;
  mmCanvas.height = container.clientHeight;
  renderMindMap();
}

function renderMindMap() {
  mmCtx.clearRect(0, 0, mmCanvas.width, mmCanvas.height);
  mmCtx.save();
  mmCtx.translate(offset.x, offset.y);

  nodes.forEach((node) => {
    if (node.parent) {
      const parent = nodes.find((n) => n.id === node.parent);
      if (parent) {
        mmCtx.beginPath();
        mmCtx.moveTo(parent.x, parent.y);
        mmCtx.bezierCurveTo(
          parent.x,
          (parent.y + node.y) / 2,
          node.x,
          (parent.y + node.y) / 2,
          node.x,
          node.y
        );
        mmCtx.strokeStyle = "#cbd5e1";
        mmCtx.lineWidth = 2;
        mmCtx.stroke();
      }
    }
  });

  nodes.forEach((node) => {
    const width = Math.max(100, node.text.length * 8 + 20);
    const height = 40;

    mmCtx.shadowColor = "rgba(0,0,0,0.1)";
    mmCtx.shadowBlur = 10;
    mmCtx.fillStyle = node.color || "#fff";
    mmCtx.beginPath();
    mmCtx.roundRect(node.x - width / 2, node.y - height / 2, width, height, 8);
    mmCtx.fill();

    if (node.parent === null) {
      mmCtx.lineWidth = 2;
      mmCtx.strokeStyle = "#4f46e5";
      mmCtx.stroke();
    }

    mmCtx.shadowBlur = 0;
    mmCtx.fillStyle = node.parent === null ? "#ffff" : "#1e293b";
    mmCtx.font = "14px Inter";
    mmCtx.textAlign = "center";
    mmCtx.textBaseline = "middle";
    mmCtx.fillText(node.text, node.x, node.y);

    node.w = width;
    node.h = height;
  });

  mmCtx.restore();
}

mmCanvas.addEventListener("mousedown", (e) => {
  const rect = mmCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left - offset.x;
  const mouseY = e.clientY - rect.top - offset.y;

  if (e.button === 2) return;

  const clickedNode = nodes
    .slice()
    .reverse()
    .find(
      (n) =>
        mouseX >= n.x - n.w / 2 &&
        mouseX <= n.x + n.w / 2 &&
        mouseY >= n.y - n.h / 2 &&
        mouseY <= n.y + n.h / 2
    );

  if (clickedNode) {
    draggingNode = clickedNode;
    isDragging = true;
    dragOffsetX = mouseX - clickedNode.x;
    dragOffsetY = mouseY - clickedNode.y;
  } else {
    isPanning = true;
    startPan = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  }
});

mmCanvas.addEventListener("mousemove", (e) => {
  const rect = mmCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left - offset.x;
  const mouseY = e.clientY - rect.top - offset.y;

  if (isDragging && draggingNode) {
    draggingNode.x = mouseX - dragOffsetX;
    draggingNode.y = mouseY - dragOffsetY;
    renderMindMap();
  } else if (isPanning) {
    offset.x = e.clientX - startPan.x;
    offset.y = e.clientY - startPan.y;
    renderMindMap();
  }
});

mmCanvas.addEventListener("mouseup", () => {
  isDragging = false;
  draggingNode = null;
  isPanning = false;
  localStorage.setItem("mm_nodes", JSON.stringify(nodes));
});

mmCanvas.addEventListener("dblclick", (e) => {
  const rect = mmCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left - offset.x;
  const mouseY = e.clientY - rect.top - offset.y;
  const clickedNode = nodes.find(
    (n) =>
      mouseX >= n.x - n.w / 2 &&
      mouseX <= n.x + n.w / 2 &&
      mouseY >= n.y - n.h / 2 &&
      mouseY <= n.y + n.h / 2
  );

  if (clickedNode) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = clickedNode.text;
    input.className = "node-input shadow-lg";
    input.style.left = clickedNode.x + offset.x + rect.left + "px";
    input.style.top = clickedNode.y + offset.y + rect.top + "px";

    document.body.appendChild(input);
    input.focus();
    input.select();

    const saveEdit = () => {
      clickedNode.text = input.value;
      input.remove();
      renderMindMap();
      localStorage.setItem("mm_nodes", JSON.stringify(nodes));
    };
    input.addEventListener("blur", saveEdit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveEdit();
    });
  }
});

mmCanvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const rect = mmCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left - offset.x;
  const mouseY = e.clientY - rect.top - offset.y;
  const clickedNode = nodes.find(
    (n) =>
      mouseX >= n.x - n.w / 2 &&
      mouseX <= n.x + n.w / 2 &&
      mouseY >= n.y - n.h / 2 &&
      mouseY <= n.y + n.h / 2
  );

  if (clickedNode) {
    nodes.push({
      id: Date.now(),
      x: clickedNode.x + 150,
      y: clickedNode.y + 50,
      text: "Novo Tópico",
      parent: clickedNode.id,
      color: "#ffffff",
    });
    renderMindMap();
    localStorage.setItem("mm_nodes", JSON.stringify(nodes));
  }
});

function addRootNode() {
  nodes.push({
    id: Date.now(),
    x: 400 - offset.x,
    y: 300 - offset.y,
    text: "Novo Tema",
    parent: null,
  });
  renderMindMap();
  localStorage.setItem("mm_nodes", JSON.stringify(nodes));
}
function clearMindMap() {
  if (confirm("Limpar mapa?")) {
    nodes = [];
    renderMindMap();
    localStorage.setItem("mm_nodes", JSON.stringify(nodes));
  }
}

let flashcards = JSON.parse(localStorage.getItem("fc_cards")) || [];
function renderFlashcards() {
  const grid = document.getElementById("fc-grid");
  grid.innerHTML = "";
  flashcards.forEach((card, index) => {
    grid.innerHTML += `
                    <div class="group h-64 w-full cursor-pointer perspective-1000">
                        <div class="relative w-full h-full text-center transition-all duration-500 transform-style-3d group-hover:shadow-xl rounded-xl" onclick="this.classList.toggle('rotate-y-180')">
                            <div class="absolute inset-0 backface-hidden bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center shadow-sm">
                                <span class="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-2">Pergunta</span>
                                <p class="text-lg font-medium text-gray-800">${card.front}</p>
                                <button onclick="deleteFlashcard(event, ${index})" class="absolute top-3 right-3 text-gray-300 hover:text-red-500 p-2"><i class="fas fa-trash"></i></button>
                            </div>
                            <div class="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-600 rounded-xl p-6 flex flex-col items-center justify-center text-white shadow-sm">
                                <span class="text-xs font-bold text-indigo-200 uppercase tracking-wider mb-2">Resposta</span>
                                <p class="text-lg">${card.back}</p>
                            </div>
                        </div>
                    </div>`;
  });
}
function addFlashcard() {
  const front = document.getElementById("fc-front").value;
  const back = document.getElementById("fc-back").value;
  if (front && back) {
    flashcards.push({ front, back });
    localStorage.setItem("fc_cards", JSON.stringify(flashcards));
    renderFlashcards();
    toggleModal("fc-modal");
  }
}
function deleteFlashcard(e, index) {
  e.stopPropagation();
  if (confirm("Apagar card?")) {
    flashcards.splice(index, 1);
    localStorage.setItem("fc_cards", JSON.stringify(flashcards));
    renderFlashcards();
  }
}

let glossary = JSON.parse(localStorage.getItem("gl_terms")) || [];
function renderGlossary(filter = "") {
  const list = document.getElementById("gl-list");
  list.innerHTML = "";
  glossary
    .filter((g) => g.term.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.term.localeCompare(b.term))
    .forEach((item, index) => {
      list.innerHTML += `
                    <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow group relative">
                        <h4 class="text-lg font-bold text-indigo-700 mb-1">${item.term}</h4>
                        <p class="text-gray-600 leading-relaxed text-sm">${item.def}</p>
                        <button onclick="deleteGlossary(${index})" class="absolute top-4 right-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fas fa-trash"></i></button>
                    </div>`;
    });
}
function addGlossaryTerm() {
  const term = document.getElementById("gl-term").value;
  const def = document.getElementById("gl-def").value;
  if (term && def) {
    glossary.push({ term, def });
    localStorage.setItem("gl_terms", JSON.stringify(glossary));
    renderGlossary();
    toggleModal("gl-modal");
  }
}
function deleteGlossary(index) {
  if (confirm("Remover termo?")) {
    glossary.splice(index, 1);
    localStorage.setItem("gl_terms", JSON.stringify(glossary));
    renderGlossary();
  }
}
document
  .getElementById("gl-search")
  .addEventListener("input", (e) => renderGlossary(e.target.value));

renderMindMap();
renderFlashcards();
renderGlossary();

switchTab("whiteboard");
