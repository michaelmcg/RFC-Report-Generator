"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  openReport: () => ipcRenderer.invoke("report:open"),
  saveReport: (args) => ipcRenderer.invoke("report:save", args),
  exportFile: (args) => ipcRenderer.invoke("export", args),
  confirmDiscard: () => ipcRenderer.invoke("confirm-discard"),
  showInFolder: (p) => ipcRenderer.invoke("show-in-folder", p),
  setDirty: (value) => ipcRenderer.send("dirty", !!value),
  closeNow: () => ipcRenderer.send("close-now"),
  setRuler: (on) => ipcRenderer.send("ruler", !!on),
  getPrefill: () => ipcRenderer.invoke("prefill:get"),
  setPrefill: (p) => ipcRenderer.send("prefill:set", p),
  saveRecovery: (data) => ipcRenderer.send("recovery:save", data),
  clearRecovery: () => ipcRenderer.send("recovery:clear"),
  frameless: process.platform !== "darwin",
  getMenu: () => ipcRenderer.invoke("menu:get"),
  clickMenu: (id) => ipcRenderer.send("menu:click", id),
  clickContextMenu: (id) => ipcRenderer.send("context-menu:click", id),
  minimize: () => ipcRenderer.send("win:minimize"),
  toggleMaximize: () => ipcRenderer.send("win:toggle-maximize"),
  closeWindow: () => ipcRenderer.send("win:close"),
  dialogResult: (id, response) => ipcRenderer.send("dialog:result", id, response),
  onMenu: (cb) => {
    ipcRenderer.on("menu", (_e, action, payload) => cb(action, payload));
  }
});
