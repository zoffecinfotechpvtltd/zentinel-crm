const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zoffecSetup", {
  chooseServer: () => ipcRenderer.send("setup:choose-server"),
  chooseClient: (url) => ipcRenderer.send("setup:choose-client", url),
});
