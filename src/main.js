const {
  app,
  Tray,
  Menu,
  BrowserWindow,
  nativeImage,
  nativeTheme,
  ipcMain,
  shell,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { autoUpdater } = require("electron-updater");

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
  // Configuração e inicialização do auto-update para ambiente de produção
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("checking-for-update", () => {
      console.log("[AutoUpdater] Procurando atualizações...");
    });

    autoUpdater.on("update-available", (info) => {
      console.log(`[AutoUpdater] Nova versão encontrada: ${info.version}. Iniciando download...`);
    });

    autoUpdater.on("update-not-available", (info) => {
      console.log(`[AutoUpdater] App está atualizado. Versão: ${info.version}`);
    });

    autoUpdater.on("error", (err) => {
      console.error("[AutoUpdater] Erro ao atualizar:", err);
    });

    autoUpdater.on("update-downloaded", (info) => {
      dialog
        .showMessageBox({
          type: "info",
          title: "Atualização Disponível",
          message: `Uma nova versão do Winsdom (v${info.version}) foi baixada!`,
          detail: "Deseja reiniciar o aplicativo agora para aplicar as atualizações?",
          buttons: ["Reiniciar e Atualizar", "Depois"],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result.response === 0) {
            autoUpdater.quitAndInstall();
          }
        });
    });

    app.whenReady().then(() => {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
          console.error("[AutoUpdater] Erro ao buscar atualizações:", err);
        });
      }, 3000);
    });
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
    IT: {
      label: "Ferramentas de Modelagem",
      submenu: [
        {
          label: "Exportar SQL (DDL)",
          click: () => window.webContents.send("menu-action", "export-sql"),
        },
        {
          label: "Exportar Imagem SVG",
          click: () => window.webContents.send("menu-action", "export-svg"),
        },
        { type: "separator" },
        {
          label: "Transformar Conceitual → Lógico",
          click: () => window.webContents.send("menu-action", "transform"),
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
    const currentBaseUrl = window.webContents.getURL().split('#')[0];
    const targetBaseUrl = url.split('#')[0];
    
    if (targetBaseUrl !== currentBaseUrl) {
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

function Home() {
  createOrFocusWindow("home", "Home.html", null, {
    width: 800,
    height: 600,
    title: "Winsdom - Hub Central"
  });
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
function ITWindow() {
  createOrFocusWindow("it_modeler", "IT.html", "IT", {
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 720,
    title: "Winsdom - Arquitetura e Modelagem de Dados"
  });
}

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, "../public/img/WinsdomIcon.png");
  const icon = nativeImage.createFromPath(iconPath);

  Home(); // Abre o Hub Central ao iniciar

  try {
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
      { label: "Hub Central", click: Home },
      { type: "separator" },
      { label: "Biologia", click: Biology },
      { label: "Matemática", click: MathWindow },
      { label: "Modelagem de Dados (T.I.)", click: ITWindow },
      { type: "separator" },
      { label: "Sair de todos", click: () => app.quit() },
    ]);

    tray.setToolTip("Winsdom Study Desktop");
    tray.setContextMenu(contextMenu);
  } catch (error) {
    console.error(error);
  }
});

app.on("second-instance", () => {
  const homeWin = openWindows.get("home");
  if (homeWin) {
    if (homeWin.isMinimized()) homeWin.restore();
    homeWin.focus();
  } else {
    Home();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Se o tray não tiver carregado (ex: linux s/ libappindicator), previne processo zumbi
    if (!tray) {
      app.quit();
    }
  }
});

app.on("activate", () => {
  if (openWindows.size === 0) Home();
});

// IPC Handler para abrir módulos a partir do Hub
ipcMain.handle("open-module", (_event, moduleName) => {
  if (moduleName === "biology") Biology();
  if (moduleName === "math") MathWindow();
  if (moduleName === "it") ITWindow();
  if (moduleName === "fq") createOrFocusWindow("fq", "FisicoQuimica.html", null, { title: "Física & Química" });
  if (moduleName === "gh") createOrFocusWindow("gh", "GeoHistoria.html", null, { title: "Geografia & História" });
  if (moduleName === "about") About();
});

ipcMain.handle("app:open-external", (_event, url) => {
  shell.openExternal(url);
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

ipcMain.handle("storage:delete", async (_event, filename) => {
  try {
    const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9_-]/g, "");
    const filePath = path.join(app.getPath("userData"), "app_data", `${sanitizedFilename}.json`);
    await fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    if (error.code === "ENOENT") return { success: true }; // Já não existe
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
