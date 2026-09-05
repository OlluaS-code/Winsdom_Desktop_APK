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

let engine = null;

const wbApp = {
  init() {
    const canvas = document.getElementById("wb-canvas");
    engine = new window.WhiteboardEngine(canvas);
  },

  resize() {
    if (engine) engine.initDpiAwareCanvas();
  },

  setTool(toolName) {
    if (engine) engine.tool = toolName;
    document
      .querySelectorAll(".tool-btn")
      .forEach((b) => b.classList.remove("active"));
    document.querySelector(`[data-tool="${toolName}"]`).classList.add("active");
  },

  setColor(colorCode, element) {
    if (engine) engine.strokeColor = colorCode;
    document
      .querySelectorAll(".color-picker")
      .forEach((c) => c.classList.remove("active"));
    element.classList.add("active");
  },

  setSize(val) {
    if (engine) engine.strokeSize = parseInt(val);
    document.getElementById("size-label").innerText = val + "px";
  },

  undo() {
    if (engine) engine.undo();
  },

  redo() {
    if (engine) engine.redo();
  },

  clear() {
    if (engine) engine.clear();
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

const fsrs = window.FSRSEngine ? new window.FSRSEngine() : null;
let flashcards = JSON.parse(localStorage.getItem("fc_cards")) || [];

function renderFlashcards() {
  const grid = document.getElementById("fc-grid");
  grid.innerHTML = "";
  
  // Ordena para que os cards atrasados (due < agora) ou novos (state === 'NEW') apareçam primeiro
  const now = Date.now();
  flashcards.sort((a, b) => {
    if (a.state === 'NEW' && b.state !== 'NEW') return -1;
    if (b.state === 'NEW' && a.state !== 'NEW') return 1;
    return (a.due || 0) - (b.due || 0);
  });

  flashcards.forEach((card, index) => {
    // Verifica se o card está pronto para revisão
    const isDue = !card.due || card.due <= now;
    const dueBadge = isDue ? `<span class="absolute top-3 left-3 bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full font-bold">Para Revisão</span>` : `<span class="absolute top-3 left-3 bg-green-100 text-green-600 text-xs px-2 py-1 rounded-full font-bold">Em Dia</span>`;

    grid.innerHTML += `
      <div class="group h-64 w-full cursor-pointer perspective-1000">
          <div class="relative w-full h-full text-center transition-all duration-500 transform-style-3d group-hover:shadow-xl rounded-xl" onclick="this.classList.toggle('rotate-y-180')">
              <div class="absolute inset-0 backface-hidden bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center shadow-sm">
                  ${dueBadge}
                  <span class="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-2">Pergunta</span>
                  <p class="text-lg font-medium text-gray-800">${card.front}</p>
                  <button onclick="deleteFlashcard(event, ${index})" class="absolute top-3 right-3 text-gray-300 hover:text-red-500 p-2"><i class="fas fa-trash"></i></button>
              </div>
              <div class="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-600 rounded-xl p-4 flex flex-col items-center justify-center text-white shadow-sm">
                  <span class="text-xs font-bold text-indigo-200 uppercase tracking-wider mb-2">Resposta</span>
                  <p class="text-lg flex-1 flex items-center justify-center">${card.back}</p>
                  
                  <!-- Botões FSRS -->
                  <div class="flex gap-2 w-full mt-2" onclick="event.stopPropagation()">
                      <button onclick="gradeCard(event, ${index}, 1)" class="flex-1 bg-red-500 hover:bg-red-600 text-xs py-2 rounded font-bold shadow transition-colors">Errei (1)</button>
                      <button onclick="gradeCard(event, ${index}, 2)" class="flex-1 bg-orange-500 hover:bg-orange-600 text-xs py-2 rounded font-bold shadow transition-colors">Difícil (2)</button>
                      <button onclick="gradeCard(event, ${index}, 3)" class="flex-1 bg-blue-500 hover:bg-blue-600 text-xs py-2 rounded font-bold shadow transition-colors">Bom (3)</button>
                      <button onclick="gradeCard(event, ${index}, 4)" class="flex-1 bg-green-500 hover:bg-green-600 text-xs py-2 rounded font-bold shadow transition-colors">Fácil (4)</button>
                  </div>
              </div>
          </div>
      </div>`;
  });
}

function gradeCard(e, index, grade) {
  e.stopPropagation();
  if (fsrs) {
    flashcards[index] = fsrs.processReview(flashcards[index], grade);
    localStorage.setItem("fc_cards", JSON.stringify(flashcards));
    renderFlashcards();
  }
}

function addFlashcard() {
  const front = document.getElementById("fc-front").value;
  const back = document.getElementById("fc-back").value;
  if (front && back) {
    flashcards.push({ 
      front, 
      back, 
      state: 'NEW',
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      lastReview: null,
      due: Date.now()
    });
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
