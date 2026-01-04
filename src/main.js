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

function handleExternalLinks(window) {
  window.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("http")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

function createStudyWindow(fileName, discipline) {
  nativeTheme.themeSource = "system";
  const iconlogo = path.join(__dirname, "../public/img/Winsdom.png");

  const win = new BrowserWindow({
    width: 900,
    height: 700,
    icon: iconlogo,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile(path.join(__dirname, fileName));
  setWindowMenu(win, discipline);
  return win;
}

function AboutWindow(fileName) {
  nativeTheme.themeSource = "system";
  const iconlogo = path.join(__dirname, "../public/img/Winsdom.png");

  const winAbout = new BrowserWindow({
    width: 900,
    height: 700,
    icon: iconlogo,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  handleExternalLinks(winAbout);

  winAbout.loadFile(path.join(__dirname, fileName));
  return winAbout;
}

function About() {
  AboutWindow("../resources/About.html");
}
function Biology() {
  createStudyWindow("../resources/Biology.html", "Biology");
}
function MathWindow() {
  createStudyWindow("../resources/Math.html", "Math");
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
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) About();
});

ipcMain.on("save-data", (event, data) => {
  const fs = require("fs");
  const userDataPath = app.getPath("userData");
  const filePath = path.join(userDataPath, `${data.category}-data.json`);
  fs.writeFile(filePath, JSON.stringify(data.content, null, 2), (err) => {
    if (err) console.error(err);
  });
});
