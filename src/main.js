const {
  app,
  Tray,
  Menu,
  BrowserWindow,
  nativeImage,
  nativeTheme,
  ipcMain,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs/promises");

// 1. Garantir Instância Única
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

if (process.argv[2] === "--dev") {
  const rootPath = path.join(__dirname, "..");
  const electronPath = path.join(rootPath, "node_modules", ".bin", "electron");

  require("electron-reload")(rootPath, {
    electron: electronPath,
    hardResetMethod: "exit",
  });
} else {
  if (app.isPackaged) {
    try {
      require("update-electron-app")();
    } catch (error) {
      console.error("Erro ao carregar o auto-update:", error);
    }
  }
}

let tray = null;
const openWindows = new Map();

function setWindowMenu(window, discipline) {
  let template = [
    {
      label: "Arquivo",
      submenu: [
        {
          label: "Exportar para PDF",
          click: () => window.webContents.send("export-pdf"),
        },
        { type: "separator" },
        { label: "Fechar Janela", role: "close" },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { label: "Desfazer", role: "undo" },
        { label: "Refazer", role: "redo" },
        { type: "separator" },
        { label: "Recortar", role: "cut" },
        { label: "Copiar", role: "copy" },
        { label: "Colar", role: "paste" },
      ],
    },
  ];

  const disciplineMenus = {
    Math: {
      label: "Ferramentas Matemáticas",
      submenu: [
        {
          label: "Inserir LaTeX (KaTeX)",
          click: () => window.webContents.send("menu-action", "insert-latex"),
        },
        {
          label: "Calculadora Simbólica",
          click: () => window.webContents.send("menu-action", "open-calc"),
        },
        {
          label: "Gerador de Planilhas",
          click: () =>
            window.webContents.send("menu-action", "open-spreadsheet"),
        },
      ],
    },
    Biology: {
      label: "Ferramentas Biológicas",
      submenu: [
        {
          label: "Novo Mapa Mental",
          click: () => window.webContents.send("menu-action", "mindmap"),
        },
        {
          label: "Gerenciar Flashcards",
          click: () => window.webContents.send("menu-action", "flashcards"),
        },
        {
          label: "Glossário Técnico",
          click: () => window.webContents.send("menu-action", "glossary"),
        },
      ],
    },
  };

  if (disciplineMenus[discipline]) {
    template.push(disciplineMenus[discipline]);
  }

  const menu = Menu.buildFromTemplate(template);
  window.setMenu(menu);
}

// 2. Interceptador Central de Links Externos
function setupSecurityGuards(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
      if (url.startsWith("https:") || url.startsWith("http:")) {
        shell.openExternal(url);
      }
    }
  });
}

// 3. Fábrica de Janelas com Controle de Ciclo de Vida
function createOrFocusWindow(moduleId, htmlFile, discipline, windowOptions = {}) {
  if (openWindows.has(moduleId)) {
    const existingWin = openWindows.get(moduleId);
    if (!existingWin.isDestroyed()) {
      existingWin.show();
      existingWin.focus();
      return existingWin;
    }
    openWindows.delete(moduleId);
  }

  nativeTheme.themeSource = "system";
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: false, // Previne visualização de tela branca antes do DOM renderizar
    backgroundColor: "#f8fafc",
    icon: path.join(__dirname, "../public/img/Winsdom.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    ...windowOptions,
  });

  setupSecurityGuards(win);

  win.loadFile(path.join(__dirname, `../resources/${htmlFile}`));

  if (discipline) {
    setWindowMenu(win, discipline);
  } else {
    win.autoHideMenuBar = true;
    win.setMenu(null);
  }

  win.once("ready-to-show", () => {
    win.show();
  });

  win.on("closed", () => {
    openWindows.delete(moduleId);
  });

  openWindows.set(moduleId, win);
  return win;
}

function About() {
  createOrFocusWindow("about", "About.html", null);
}
function Biology() {
  createOrFocusWindow("biology", "Biology.html", "Biology");
}
function MathWindow() {
  createOrFocusWindow("math", "Math.html", "Math");
}

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, "../public/img/WinsdomIcon.png");
  const icon = nativeImage.createFromPath(iconPath);

  try {
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
      { label: "Sobre", click: About },
      { type: "separator" },
      { label: "Biologia", click: Biology },
      { label: "Matemática", click: MathWindow },
      { type: "separator" },
      { label: "Sair de todos", click: () => app.quit() },
    ]);

    tray.setToolTip("Winsdom Study Desktop");
    tray.setContextMenu(contextMenu);
  } catch (error) {
    console.error(error);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Mantemos aberto porque o tray está gerenciando
  }
});

app.on("activate", () => {
  if (openWindows.size === 0) About();
});

// 4. Operações Atômicas de Persistência via IPC Invoke/Handle
ipcMain.handle("storage:write", async (_event, { filename, payload }) => {
  try {
    const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9_-]/g, "");
    const targetDir = path.join(app.getPath("userData"), "app_data");
    await fs.mkdir(targetDir, { recursive: true });
    
    const filePath = path.join(targetDir, `${sanitizedFilename}.json`);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("storage:read", async (_event, filename) => {
  try {
    const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9_-]/g, "");
    const filePath = path.join(app.getPath("userData"), "app_data", `${sanitizedFilename}.json`);
    const data = await fs.readFile(filePath, "utf-8");
    return { success: true, data: JSON.parse(data) };
  } catch (error) {
    if (error.code === "ENOENT") return { success: true, data: null };
    return { success: false, error: error.message };
  }
});

// Legacy fallback para não quebrar módulos que ainda não foram atualizados
ipcMain.on("save-data", (event, data) => {
  const fsSync = require("fs");
  const userDataPath = app.getPath("userData");
  const filePath = path.join(userDataPath, `${data.category}-data.json`);
  fsSync.writeFile(filePath, JSON.stringify(data.content, null, 2), (err) => {
    if (err) console.error(err);
  });
});
