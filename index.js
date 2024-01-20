const { app, BrowserWindow, ipcMain } = require("electron");
const si = require("systeminformation");
const os = require("os");
const ping = require("ping");
const { exec } = require("child_process");
const FastSpeedtest = require("fast-speedtest-api");
require("dotenv").config();
const apiKey = process.env.BANDWIDTH_CALCULATION_API_KEY;

async function calculateBandwidth() {
  try {
    const speedtest = new FastSpeedtest({
      token: apiKey, // Get an API token from https://fast.com/api/
    });
    console.log("working on it !");
    const downloadSpeed = await speedtest.getSpeed();
    console.log(downloadSpeed);
    return { download: downloadSpeed / 100000, upload: 0 }; // fast-speedtest-api only measures download speed
  } catch (error) {
    console.error("Error measuring bandwidth:", error);
    return { download: 0, upload: 0 };
  }
}

function createWindow() {
  let win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile("index.html");

  monitorNetwork(win);
  monitorCpuUtilization(win);
}

async function calculatePacketLoss() {
  const host = "8.8.8.8";
  const numPings = 10;
  let lostPackets = 0;

  for (let i = 0; i < numPings; i++) {
    const res = await ping.promise.probe(host, { timeout: 2 });
    if (!res.alive) lostPackets++;
  }

  const packetLossPercent = (lostPackets / numPings) * 100;
  return packetLossPercent;
}

// async function calculateBandwidth() {
//   try {
//     const result = await speedTest({ acceptLicense: true });
//     const downloadSpeed = result.download.bandwidth / 1024 / 1024; // Convert to Mbps
//     const uploadSpeed = result.upload.bandwidth / 1024 / 1024; // Convert to Mbps
//     return { download: downloadSpeed, upload: uploadSpeed };
//   } catch (error) {
//     console.error("Error measuring bandwidth:", error);
//     return { download: 0, upload: 0 };
//   }
// }

async function calculateJitterAndLatency() {
  let previousPing = 0;
  let jitterValues = [];
  let latencyValues = [];
  const host = "8.8.8.8"; // Example host for ping
  const numPings = 10;

  for (let i = 0; i < numPings; i++) {
    const res = await ping.promise.probe(host);
    const currentPing = res.time;
    latencyValues.push(currentPing);

    if (previousPing !== 0) {
      const jitter = Math.abs(currentPing - previousPing);
      jitterValues.push(jitter);
    }
    previousPing = currentPing;
  }

  const jitterSum = jitterValues.reduce((a, b) => a + b, 0);
  const jitterAverage =
    jitterValues.length > 0 ? jitterSum / jitterValues.length : 0;

  const latencySum = latencyValues.reduce((a, b) => a + b, 0);
  const latencyAverage =
    latencyValues.length > 0 ? latencySum / latencyValues.length : 0;

  return { jitter: jitterAverage, latency: latencyAverage };
}

function getWifiSignalStrength() {
  return new Promise((resolve, reject) => {
    if (os.platform() === "win32") {
      // Windows command to get Wi-Fi signal strength
      exec("netsh wlan show interfaces", (error, stdout, stderr) => {
        if (error) {
          reject(`error: ${error.message}`);
          return;
        }
        if (stderr) {
          reject(`stderr: ${stderr}`);
          return;
        }
        // Parse stdout to find signal strength
        // Example parsing logic, might need adjustment
        const match = stdout.match(/Signal\s*:\s*(\d+)%/);
        if (match && match[1]) {
          resolve(parseInt(match[1], 10));
        } else {
          reject("Signal strength not found");
        }
      });
    } else if (os.platform() === "darwin") {
      // macOS command (requires enabling airport command)
      // NOTE: This might require additional setup on macOS
      exec(
        "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I",
        (error, stdout, stderr) => {
          if (error) {
            reject(`error: ${error.message}`);
            return;
          }
          if (stderr) {
            reject(`stderr: ${stderr}`);
            return;
          }
          // Parse stdout to find signal strength
          // Example parsing logic, might need adjustment
          const match = stdout.match(/agrCtlRSSI:\s*(-\d+)/);
          if (match && match[1]) {
            resolve(parseInt(match[1], 10));
          } else {
            reject("Signal strength not found");
          }
        }
      );
    } else {
      reject("Unsupported platform");
    }
  });
}

async function monitorNetwork(win) {
  // Interval for updating network stats every 0.5 seconds
  setInterval(async () => {
    try {
      const networkStats = await si.networkStats();
      win.webContents.send("network-data", { networkStats });
    } catch (error) {
      console.error("Error fetching network statistics:", error);
    }
  }, 500);

  setInterval(async () => {
    try {
      const packetLoss = await calculatePacketLoss();
      win.webContents.send("packet-loss-data", packetLoss);
    } catch (error) {
      console.error("Error calculating packet loss:", error);
    }
  }, 10000);

  // Separate interval for updating jitter and latency every 10 seconds
  setInterval(async () => {
    try {
      const { jitter, latency } = await calculateJitterAndLatency();
      win.webContents.send("jitter-latency-data", { jitter, latency });
    } catch (error) {
      console.error("Error calculating jitter and latency:", error);
    }
  }, 10000);

  setInterval(async () => {
    try {
      const bandwidth = await calculateBandwidth();
      win.webContents.send("bandwidth-data", bandwidth);
    } catch (error) {
      console.error("Error measuring bandwidth:", error);
    }
  }, 10000);

  setInterval(async () => {
    try {
      const wifiSignalStrength = await getWifiSignalStrength();
      win.webContents.send("wifi-signal-strength-data", wifiSignalStrength);
    } catch (error) {
      console.error("Error fetching Wi-Fi signal strength:", error);
    }
  }, 10000);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
