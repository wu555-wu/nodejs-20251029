const express = require("express");
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const execAsync = promisify(require('child_process').exec);
const { execSync } = require('child_process');

const DEFAULTS = {
  UPLOAD_URL: '',
  PROJECT_URL: '',
  AUTO_ACCESS: false,
  FILE_PATH: './tmp',
  SUB_PATH: 'sub',
  PORT: 3000,
  UUID: '9afd1229-b893-40c1-84dd-51e7ce204913',
  NEZHA_SERVER: '',
  NEZHA_PORT: '',
  NEZHA_KEY: '',
  ARGO_DOMAIN: '',
  ARGO_AUTH: '',
  ARGO_PORT: 8001,
  CFIP: 'cdns.doon.eu.org',
  CFPORT: 443,
  NAME: '',
};

function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm';
  } else {
    return 'amd';
  }
}

function getFilesForArchitecture(architecture, opts = {}) {
  const { webPath, botPath, npmPath, phpPath, NEZHA_SERVER, NEZHA_KEY, NEZHA_PORT } = opts;
  let baseFiles;
  if (architecture === 'arm') {
    baseFiles = [
      { fileName: webPath, fileUrl: "https://arm64.ssss.nyc.mn/web" },
      { fileName: botPath, fileUrl: "https://arm64.ssss.nyc.mn/bot" }
    ];
  } else {
    baseFiles = [
      { fileName: webPath, fileUrl: "https://amd64.ssss.nyc.mn/web" },
      { fileName: botPath, fileUrl: "https://amd64.ssss.nyc.mn/bot" }
    ];
  }

  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      const npmUrl = architecture === 'arm'
        ? "https://arm64.ssss.nyc.mn/agent"
        : "https://amd64.ssss.nyc.mn/agent";
      baseFiles.unshift({
        fileName: npmPath,
        fileUrl: npmUrl
      });
    } else {
      const phpUrl = architecture === 'arm'
        ? "https://arm64.ssss.nyc.mn/v1"
        : "https://amd64.ssss.nyc.mn/v1";
      baseFiles.unshift({
        fileName: phpPath,
        fileUrl: phpUrl
      });
    }
  }

  return baseFiles;
}

function deleteNodes(opts = {}) {
  const { UPLOAD_URL, subPath } = opts;
  try {
    if (!UPLOAD_URL) return;
    if (!fs.existsSync(subPath)) return;

    let fileContent;
    try {
      fileContent = fs.readFileSync(subPath, 'utf-8');
    } catch {
      return null;
    }

    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line =>
      /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line)
    );

    if (nodes.length === 0) return;

    axios.post(`${UPLOAD_URL}/api/delete-nodes`,
      JSON.stringify({ nodes }),
      { headers: { 'Content-Type': 'application/json' } }
    ).catch(() => {
      return null;
    });
    return null;
  } catch (err) {
    return null;
  }
}

function cleanupOldFiles(FILE_PATH) {
  try {
    const files = fs.readdirSync(FILE_PATH);
    files.forEach(file => {
      const filePath = path.join(FILE_PATH, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        // ignore
      }
    });
  } catch (err) {
    // ignore
  }
}

function generateConfig(opts = {}) {
  const { ARGO_PORT = 8001, UUID, FILE_PATH } = opts;
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [{ protocol: "freedom", tag: "direct" }, { protocol: "blackhole", tag: "block" }]
  };
  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
  return config;
}

function argoType(opts = {}) {
  const { ARGO_AUTH, ARGO_DOMAIN, ARGO_PORT, FILE_PATH } = opts;
  if (!ARGO_AUTH || !ARGO_DOMAIN) {
    return 'quick';
  }

  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelYaml = `
  tunnel: ${ARGO_AUTH.split('"')[11]}
  credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
  protocol: http2
  
  ingress:
    - hostname: ${ARGO_DOMAIN}
      service: http://localhost:${ARGO_PORT}
      originRequest:
        noTLSVerify: true
    - service: http_status:404
  `;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
    return 'json';
  } else {
    return 'token';
  }
}

function generateLinks(argoDomain, opts = {}) {
  const { UUID, CFIP, CFPORT, NAME, SUB_PATH } = opts;
  const nodeName = NAME ? `${NAME}-TestISP` : 'TestISP';

  const VMESS = {
    v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT,
    id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none',
    host: argoDomain, path: '/vmess-argo?ed=2560',
    tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox'
  };

  const subTxt = `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}
  
vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}
  
trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}
    `;

  return { subTxt, VMESS, nodeName };
}

function createApp() {
  const app = express();
  app.get("/", function (req, res) {
    res.send("Hello world!");
  });
  return app;
}

module.exports = {
  DEFAULTS,
  generateRandomName,
  getSystemArchitecture,
  getFilesForArchitecture,
  deleteNodes,
  cleanupOldFiles,
  generateConfig,
  argoType,
  generateLinks,
  createApp,
};
