const {BrowserWindow, globalShortcut} = require("electron");
const WindowApp = require("electron").app;
let window = null;
const fs = require("fs");
/*** @type {{name: string, ip: string, port: number}[]} */
let servers = require("./servers.json");

const createWindow = async () => {
    window = new BrowserWindow({fullscreen: true});
    window.removeMenu();
    window.setIcon("./img.png");
    window.fullScreenable = false;
    window.on("leave-full-screen", () => WindowApp.quit());
    globalShortcut.register("CommandOrControl+Shift+R", () => window.reload());
    globalShortcut.register("CommandOrControl+Shift+H", () => window.webContents.isDevToolsOpened() ? window.webContents.closeDevTools() : window.webContents.openDevTools());
    await window.loadFile("./src/index.html");
    window._load = async () => {
        await window.webContents.executeJavaScript(`document.settings=${JSON.stringify(require("./settings.json"))};document.servers=${JSON.stringify(servers)};document.tokens=${JSON.stringify(require("./.tokens.json"))};document.ready();`);
    };
    window.webContents.on("console-message", (_, __, message) => {
        let json;
        try {
            json = JSON.parse(message.toString());
        } catch (e) {
        }
        if(!json) return;
        switch(json.action) {
            case "Set-Tokens":
                fs.writeFileSync("./.tokens.json", JSON.stringify(json.data));
                break;
            case "Set-Servers":
                servers = json.data;
                fs.writeFileSync("./servers.json", JSON.stringify(servers));
                break;
            case "Set-Settings":
                fs.writeFileSync("./settings.json", JSON.stringify(json.data));
                break;
        }
    });
    await window._load();
    window.webContents.on("did-finish-load", window._load);
}

WindowApp.whenReady().then(async () => {
    await createWindow();
    WindowApp.on("activate", async () => BrowserWindow.getAllWindows().length === 0 ? await createWindow() : null);
});

WindowApp.on("window-all-closed", () => {
    if (process.platform !== "darwin") WindowApp.quit()
});