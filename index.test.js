const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const {
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
} = require('./index.testable');

const TEST_DIR = path.join(os.tmpdir(), 'nodejs-test-' + Date.now());

beforeAll(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

// ---------- utls vulnerability fix ----------
describe('utls vulnerability fix', () => {
  it('should use fp=firefox in VLESS links, not fp=chrome', () => {
    const { subTxt } = generateLinks('example.trycloudflare.com', {
      UUID: DEFAULTS.UUID,
      CFIP: DEFAULTS.CFIP,
      CFPORT: DEFAULTS.CFPORT,
      NAME: '',
      SUB_PATH: 'sub',
    });
    expect(subTxt).toContain('fp=firefox');
    expect(subTxt).not.toContain('fp=chrome');
  });

  it('should use fp=firefox in VMESS config object', () => {
    const { VMESS } = generateLinks('example.trycloudflare.com', {
      UUID: DEFAULTS.UUID,
      CFIP: DEFAULTS.CFIP,
      CFPORT: DEFAULTS.CFPORT,
      NAME: '',
      SUB_PATH: 'sub',
    });
    expect(VMESS.fp).toBe('firefox');
    expect(VMESS.fp).not.toBe('chrome');
  });

  it('should use fp=firefox in trojan links', () => {
    const { subTxt } = generateLinks('example.trycloudflare.com', {
      UUID: DEFAULTS.UUID,
      CFIP: DEFAULTS.CFIP,
      CFPORT: DEFAULTS.CFPORT,
      NAME: '',
      SUB_PATH: 'sub',
    });
    const trojanLine = subTxt.split('\n').find(l => l.startsWith('trojan://'));
    expect(trojanLine).toContain('fp=firefox');
    expect(trojanLine).not.toContain('fp=chrome');
  });

  it('should use fp=firefox in the obfuscated build', () => {
    const code = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    expect(code).toContain('firefox');
    expect(code).not.toContain('chrome');
  });
});

// ---------- generateRandomName ----------
describe('generateRandomName', () => {
  it('should return a 6-character string', () => {
    const name = generateRandomName();
    expect(name).toHaveLength(6);
  });

  it('should contain only lowercase letters', () => {
    for (let i = 0; i < 20; i++) {
      const name = generateRandomName();
      expect(name).toMatch(/^[a-z]{6}$/);
    }
  });

  it('should produce different names on successive calls', () => {
    const names = new Set();
    for (let i = 0; i < 50; i++) {
      names.add(generateRandomName());
    }
    expect(names.size).toBeGreaterThan(1);
  });
});

// ---------- getSystemArchitecture ----------
describe('getSystemArchitecture', () => {
  it('should return arm or amd', () => {
    const arch = getSystemArchitecture();
    expect(['arm', 'amd']).toContain(arch);
  });

  it('should return amd on x64', () => {
    const origArch = os.arch;
    jest.spyOn(os, 'arch').mockReturnValue('x64');
    expect(getSystemArchitecture()).toBe('amd');
    os.arch.mockRestore();
  });

  it('should return arm on arm64', () => {
    jest.spyOn(os, 'arch').mockReturnValue('arm64');
    expect(getSystemArchitecture()).toBe('arm');
    os.arch.mockRestore();
  });

  it('should return arm on aarch64', () => {
    jest.spyOn(os, 'arch').mockReturnValue('aarch64');
    expect(getSystemArchitecture()).toBe('arm');
    os.arch.mockRestore();
  });

  it('should return arm on arm', () => {
    jest.spyOn(os, 'arch').mockReturnValue('arm');
    expect(getSystemArchitecture()).toBe('arm');
    os.arch.mockRestore();
  });
});

// ---------- getFilesForArchitecture ----------
describe('getFilesForArchitecture', () => {
  const baseOpts = {
    webPath: '/tmp/web',
    botPath: '/tmp/bot',
    npmPath: '/tmp/npm',
    phpPath: '/tmp/php',
    NEZHA_SERVER: '',
    NEZHA_KEY: '',
    NEZHA_PORT: '',
  };

  it('should return amd64 URLs for amd architecture', () => {
    const files = getFilesForArchitecture('amd', baseOpts);
    expect(files).toHaveLength(2);
    expect(files[0].fileUrl).toContain('amd64');
    expect(files[1].fileUrl).toContain('amd64');
  });

  it('should return arm64 URLs for arm architecture', () => {
    const files = getFilesForArchitecture('arm', baseOpts);
    expect(files).toHaveLength(2);
    expect(files[0].fileUrl).toContain('arm64');
    expect(files[1].fileUrl).toContain('arm64');
  });

  it('should include npm agent when NEZHA_PORT is set', () => {
    const opts = { ...baseOpts, NEZHA_SERVER: 'nz.example.com', NEZHA_KEY: 'secret', NEZHA_PORT: '443' };
    const files = getFilesForArchitecture('amd', opts);
    expect(files).toHaveLength(3);
    expect(files[0].fileUrl).toContain('agent');
    expect(files[0].fileName).toBe('/tmp/npm');
  });

  it('should include php v1 when NEZHA_PORT is empty', () => {
    const opts = { ...baseOpts, NEZHA_SERVER: 'nz.example.com:8008', NEZHA_KEY: 'secret', NEZHA_PORT: '' };
    const files = getFilesForArchitecture('amd', opts);
    expect(files).toHaveLength(3);
    expect(files[0].fileUrl).toContain('v1');
    expect(files[0].fileName).toBe('/tmp/php');
  });

  it('should return only 2 files when NEZHA vars are empty', () => {
    const files = getFilesForArchitecture('amd', baseOpts);
    expect(files).toHaveLength(2);
    const fileNames = files.map(f => f.fileName);
    expect(fileNames).toContain('/tmp/web');
    expect(fileNames).toContain('/tmp/bot');
  });

  it('should use arm64 agent URL for arm + NEZHA_PORT', () => {
    const opts = { ...baseOpts, NEZHA_SERVER: 'nz.example.com', NEZHA_KEY: 'key', NEZHA_PORT: '5555' };
    const files = getFilesForArchitecture('arm', opts);
    expect(files[0].fileUrl).toBe('https://arm64.ssss.nyc.mn/agent');
  });

  it('should use arm64 v1 URL for arm + no NEZHA_PORT', () => {
    const opts = { ...baseOpts, NEZHA_SERVER: 'nz.example.com:8008', NEZHA_KEY: 'key', NEZHA_PORT: '' };
    const files = getFilesForArchitecture('arm', opts);
    expect(files[0].fileUrl).toBe('https://arm64.ssss.nyc.mn/v1');
  });
});

// ---------- deleteNodes ----------
describe('deleteNodes', () => {
  it('should return early when UPLOAD_URL is empty', () => {
    const result = deleteNodes({ UPLOAD_URL: '', subPath: '/nonexistent' });
    expect(result).toBeUndefined();
  });

  it('should return early when sub.txt does not exist', () => {
    const result = deleteNodes({ UPLOAD_URL: 'http://example.com', subPath: '/nonexistent/sub.txt' });
    expect(result).toBeUndefined();
  });

  it('should return null when sub.txt has no valid nodes', () => {
    const subFile = path.join(TEST_DIR, 'sub_empty.txt');
    fs.writeFileSync(subFile, Buffer.from('no-valid-nodes\n').toString('base64'));
    const result = deleteNodes({ UPLOAD_URL: 'http://example.com', subPath: subFile });
    expect(result).toBeUndefined();
  });

  it('should return null when sub.txt has valid nodes', () => {
    const subFile = path.join(TEST_DIR, 'sub_valid.txt');
    const nodeData = 'vless://uuid@host:443?security=tls#name\ntrojan://uuid@host:443#name2';
    fs.writeFileSync(subFile, Buffer.from(nodeData).toString('base64'));
    const result = deleteNodes({ UPLOAD_URL: 'http://example.com', subPath: subFile });
    expect(result).toBeNull();
  });

  it('should return null on read error', () => {
    const subDir = path.join(TEST_DIR, 'sub_dir_not_file');
    fs.mkdirSync(subDir, { recursive: true });
    const subFile = path.join(subDir, 'sub.txt');
    fs.writeFileSync(subFile, 'not-base64');
    fs.chmodSync(subFile, 0o000);
    const result = deleteNodes({ UPLOAD_URL: 'http://example.com', subPath: subFile });
    fs.chmodSync(subFile, 0o644);
    expect(result).toBeNull();
  });
});

// ---------- cleanupOldFiles ----------
describe('cleanupOldFiles', () => {
  it('should delete all files in the directory', () => {
    const cleanDir = path.join(TEST_DIR, 'cleanup_test');
    fs.mkdirSync(cleanDir, { recursive: true });
    fs.writeFileSync(path.join(cleanDir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(cleanDir, 'b.txt'), 'b');
    fs.mkdirSync(path.join(cleanDir, 'subdir'), { recursive: true });

    cleanupOldFiles(cleanDir);

    const remaining = fs.readdirSync(cleanDir);
    expect(remaining).toEqual(['subdir']);
  });

  it('should not throw when directory does not exist', () => {
    expect(() => cleanupOldFiles('/nonexistent/path')).not.toThrow();
  });

  it('should handle empty directory', () => {
    const emptyDir = path.join(TEST_DIR, 'empty_cleanup');
    fs.mkdirSync(emptyDir, { recursive: true });
    expect(() => cleanupOldFiles(emptyDir)).not.toThrow();
  });
});

// ---------- generateConfig ----------
describe('generateConfig', () => {
  it('should write config.json with correct structure', () => {
    const configDir = path.join(TEST_DIR, 'config_test');
    fs.mkdirSync(configDir, { recursive: true });
    const config = generateConfig({
      ARGO_PORT: 8001,
      UUID: 'test-uuid',
      FILE_PATH: configDir,
    });

    expect(config.log.loglevel).toBe('none');
    expect(config.inbounds).toHaveLength(5);
    expect(config.inbounds[0].protocol).toBe('vless');
    expect(config.inbounds[0].settings.clients[0].id).toBe('test-uuid');
    expect(config.inbounds[0].settings.clients[0].flow).toBe('xtls-rprx-vision');
    expect(config.dns.servers[0]).toBe('https+local://8.8.8.8/dns-query');
    expect(config.outbounds).toHaveLength(2);

    const written = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf8'));
    expect(written).toEqual(config);
  });

  it('should use the provided ARGO_PORT', () => {
    const configDir = path.join(TEST_DIR, 'config_port_test');
    fs.mkdirSync(configDir, { recursive: true });
    const config = generateConfig({
      ARGO_PORT: 9999,
      UUID: 'test-uuid',
      FILE_PATH: configDir,
    });
    expect(config.inbounds[0].port).toBe(9999);
  });

  it('should configure all protocol inbounds', () => {
    const configDir = path.join(TEST_DIR, 'config_protocols');
    fs.mkdirSync(configDir, { recursive: true });
    const config = generateConfig({
      ARGO_PORT: 8001,
      UUID: 'proto-uuid',
      FILE_PATH: configDir,
    });
    const protocols = config.inbounds.map(i => i.protocol);
    expect(protocols).toEqual(['vless', 'vless', 'vless', 'vmess', 'trojan']);
  });

  it('should set trojan password to UUID', () => {
    const configDir = path.join(TEST_DIR, 'config_trojan');
    fs.mkdirSync(configDir, { recursive: true });
    const config = generateConfig({
      ARGO_PORT: 8001,
      UUID: 'trojan-uuid',
      FILE_PATH: configDir,
    });
    expect(config.inbounds[4].settings.clients[0].password).toBe('trojan-uuid');
  });

  it('should configure websocket paths for vless/vmess/trojan', () => {
    const configDir = path.join(TEST_DIR, 'config_ws');
    fs.mkdirSync(configDir, { recursive: true });
    const config = generateConfig({
      ARGO_PORT: 8001,
      UUID: 'ws-uuid',
      FILE_PATH: configDir,
    });
    expect(config.inbounds[2].streamSettings.wsSettings.path).toBe('/vless-argo');
    expect(config.inbounds[3].streamSettings.wsSettings.path).toBe('/vmess-argo');
    expect(config.inbounds[4].streamSettings.wsSettings.path).toBe('/trojan-argo');
  });
});

// ---------- argoType ----------
describe('argoType', () => {
  it('should return quick when ARGO_AUTH is empty', () => {
    const result = argoType({ ARGO_AUTH: '', ARGO_DOMAIN: 'example.com', ARGO_PORT: 8001, FILE_PATH: TEST_DIR });
    expect(result).toBe('quick');
  });

  it('should return quick when ARGO_DOMAIN is empty', () => {
    const result = argoType({ ARGO_AUTH: 'some-token', ARGO_DOMAIN: '', ARGO_PORT: 8001, FILE_PATH: TEST_DIR });
    expect(result).toBe('quick');
  });

  it('should return token when ARGO_AUTH does not contain TunnelSecret', () => {
    const result = argoType({
      ARGO_AUTH: 'eyJhIjoiYiJ9',
      ARGO_DOMAIN: 'tunnel.example.com',
      ARGO_PORT: 8001,
      FILE_PATH: TEST_DIR
    });
    expect(result).toBe('token');
  });

  it('should write tunnel config when ARGO_AUTH contains TunnelSecret', () => {
    const argoDir = path.join(TEST_DIR, 'argo_json');
    fs.mkdirSync(argoDir, { recursive: true });
    const jsonAuth = '{"AccountTag":"act","TunnelSecret":"secret123","TunnelID":"tid","TunnelName":"myname","TunnelExtra":"val"}';
    const result = argoType({
      ARGO_AUTH: jsonAuth,
      ARGO_DOMAIN: 'tunnel.example.com',
      ARGO_PORT: 8001,
      FILE_PATH: argoDir,
    });
    expect(result).toBe('json');
    expect(fs.existsSync(path.join(argoDir, 'tunnel.json'))).toBe(true);
    expect(fs.existsSync(path.join(argoDir, 'tunnel.yml'))).toBe(true);

    const yml = fs.readFileSync(path.join(argoDir, 'tunnel.yml'), 'utf8');
    expect(yml).toContain('tunnel.example.com');
    expect(yml).toContain('http_status:404');
  });
});

// ---------- generateLinks ----------
describe('generateLinks', () => {
  const linkOpts = {
    UUID: 'test-uuid-1234',
    CFIP: 'cdn.example.com',
    CFPORT: 443,
    NAME: 'TestNode',
    SUB_PATH: 'sub',
  };

  it('should generate vless link with correct UUID', () => {
    const { subTxt } = generateLinks('argo.example.com', linkOpts);
    expect(subTxt).toContain(`vless://test-uuid-1234@cdn.example.com:443`);
  });

  it('should generate vmess link as base64', () => {
    const { subTxt } = generateLinks('argo.example.com', linkOpts);
    const vmessLine = subTxt.split('\n').find(l => l.startsWith('vmess://'));
    expect(vmessLine).toBeDefined();
    const b64 = vmessLine.replace('vmess://', '');
    const decoded = JSON.parse(Buffer.from(b64, 'base64').toString());
    expect(decoded.id).toBe('test-uuid-1234');
    expect(decoded.fp).toBe('firefox');
    expect(decoded.host).toBe('argo.example.com');
  });

  it('should generate trojan link with correct format', () => {
    const { subTxt } = generateLinks('argo.example.com', linkOpts);
    const trojanLine = subTxt.split('\n').find(l => l.startsWith('trojan://'));
    expect(trojanLine).toContain('trojan://test-uuid-1234@cdn.example.com:443');
    expect(trojanLine).toContain('sni=argo.example.com');
  });

  it('should use NAME-ISP as node name when NAME is set', () => {
    const { nodeName } = generateLinks('argo.example.com', linkOpts);
    expect(nodeName).toBe('TestNode-TestISP');
  });

  it('should use only ISP when NAME is empty', () => {
    const { nodeName } = generateLinks('argo.example.com', { ...linkOpts, NAME: '' });
    expect(nodeName).toBe('TestISP');
  });

  it('should include all three protocols in subscription', () => {
    const { subTxt } = generateLinks('argo.example.com', linkOpts);
    expect(subTxt).toMatch(/vless:\/\//);
    expect(subTxt).toMatch(/vmess:\/\//);
    expect(subTxt).toMatch(/trojan:\/\//);
  });

  it('should set VMESS config fields correctly', () => {
    const { VMESS } = generateLinks('argo.example.com', linkOpts);
    expect(VMESS.v).toBe('2');
    expect(VMESS.net).toBe('ws');
    expect(VMESS.tls).toBe('tls');
    expect(VMESS.sni).toBe('argo.example.com');
    expect(VMESS.path).toBe('/vmess-argo?ed=2560');
    expect(VMESS.aid).toBe('0');
    expect(VMESS.scy).toBe('none');
  });
});

// ---------- Express root route ----------
describe('Express app', () => {
  let server;
  let app;
  let port;

  beforeAll((done) => {
    app = createApp();
    server = app.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('should respond with Hello world! on GET /', (done) => {
    http.get(`http://localhost:${port}/`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        expect(res.statusCode).toBe(200);
        expect(data).toBe('Hello world!');
        done();
      });
    });
  });

  it('should return 404 for unknown routes', (done) => {
    http.get(`http://localhost:${port}/nonexistent`, (res) => {
      expect(res.statusCode).toBe(404);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        done();
      });
    });
  });
});

// ---------- Obfuscated build integration ----------
describe('obfuscated index.js integrity', () => {
  it('should be a single-line obfuscated file', () => {
    const code = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    const lines = code.split('\n').filter(l => l.trim().length > 0);
    expect(lines.length).toBe(1);
  });

  it('should contain the firefox fingerprint string', () => {
    const code = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    expect(code).toContain('firefox');
  });

  it('should NOT contain the vulnerable chrome fingerprint', () => {
    const code = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    expect(code).not.toContain('chrome');
  });

  it('should contain required protocol references', () => {
    const code = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    expect(code).toContain('vless');
    expect(code).toContain('vmess');
    expect(code).toContain('trojan');
  });

  it('should contain express require', () => {
    const code = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    expect(code).toContain('express');
  });

  it('should contain generateRandomName for file name randomization', () => {
    const code = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    expect(code).toContain('generateRandomName');
  });
});

// ---------- DEFAULTS ----------
describe('DEFAULTS', () => {
  it('should have correct default UUID', () => {
    expect(DEFAULTS.UUID).toBe('9afd1229-b893-40c1-84dd-51e7ce204913');
  });

  it('should default port to 3000', () => {
    expect(DEFAULTS.PORT).toBe(3000);
  });

  it('should default ARGO_PORT to 8001', () => {
    expect(DEFAULTS.ARGO_PORT).toBe(8001);
  });

  it('should default CFPORT to 443', () => {
    expect(DEFAULTS.CFPORT).toBe(443);
  });

  it('should default FILE_PATH to ./tmp', () => {
    expect(DEFAULTS.FILE_PATH).toBe('./tmp');
  });

  it('should default SUB_PATH to sub', () => {
    expect(DEFAULTS.SUB_PATH).toBe('sub');
  });
});
