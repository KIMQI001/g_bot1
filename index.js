const fileSystem = require('fs');
const WebSocket = require('isomorphic-ws');
const request = require('axios');
const { v4: generateUUID } = require('uuid');
const { HttpsProxyAgent } = require('https-proxy-agent');
require('colors');

console.error = function () {};

(async function initiate() {
  showHeader();  
  await wait(1000);
  const configuration = new Configuration();
  const botInstance = new BotInstance(configuration);

  const proxyList = await loadLines('proxy.txt');
  if (proxyList.length === 0) {
    console.error('Proxies not found...'.red);
    return;
  }
  console.log(`Processing with ${proxyList.length} proxies, trying to filter the proxy and only connect with active proxy...`.cyan);

  const userIDList = await loadLines('userid.txt');
  if (userIDList.length === 0) {
    console.error('Account is not available in userid.txt'.red);
    return;
  }
  console.log(`Detected total ${userIDList.length.toString().green} accounts, trying to connect...\n`.white);

  const connectionTasks = userIDList.flatMap((userID) =>
    proxyList.map((proxy) => botInstance.proxyConnect(proxy, userID))
  );
  await Promise.all(connectionTasks);
})().catch(console.error);

function center(text) {
  const width = process.stdout.columns || 80;
  return text.padStart((width + text.length) / 2);
}

function showIntro() {
  console.log('\n');
  console.log(center("🌱 Grass Network 🌱").green.bold);
  console.log(center("GitHub: recitativonika").cyan);
  console.log(center("Link: github.com/recitativonika").cyan);
}

function showHeader() {
  showIntro();
  console.log('\n');
  console.log(center("Processing, please wait a moment...").cyan.bold);
  console.log('\n');
}

class BotInstance {
  constructor(configuration) {
    this.configuration = configuration;
    this.totalDataUsage = {};
  }

  async proxyConnect(proxy, userID) {
    try {
      const proxyDetails = await this.getProxyDetails(proxy);
      if (!proxyDetails) return;

      const wsClient = new WebSocket('wss://proxy2.wynd.network:4650/', {
        agent: this.getProxyAgent(proxy),
        headers: this.defaultHeaders(),
        rejectUnauthorized: false
      });

      wsClient.onopen = () => {
        console.log(`Connected to ${proxy}`.blue);
        console.log(`Proxy IP: ${proxyDetails.ip.yellow}, Region: ${proxyDetails.region} ${proxyDetails.country}`.white);
        console.log(`WebSocket connection established for userID: ${userID}`.green);
      };

      wsClient.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log(`Received message: ${JSON.stringify(message, null, 2)}`.gray);
        
        const dataUsage = event.data.length;
        if (!this.totalDataUsage[userID]) {
          this.totalDataUsage[userID] = 0;
        }
        this.totalDataUsage[userID] += dataUsage;
        
        if (message.action === 'AUTH') {
          const authResponse = {
            id: message.id,
            origin_action: 'AUTH',
            result: {
              browser_id: generateUUID(),
              user_id: userID,
              user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
              timestamp: Math.floor(Date.now() / 1000),
              device_type: 'desktop',
              version: '4.28.2',
              platform: 'Windows',
              os: 'Windows',
              browser: 'Chrome'
            },
          };
          console.log(`Sending AUTH response: ${JSON.stringify(authResponse, null, 2)}`.yellow);
          wsClient.send(JSON.stringify(authResponse));
          console.log(`Sent authentication for userID: ${authResponse.result.user_id}`.green);

          // 发送认证后立即发送 PING
          setTimeout(() => {
            this.sendPing(wsClient, proxyDetails.ip);
          }, 1000);
        } else if (message.action === 'PONG') {
          const totalDataUsageKB = (this.totalDataUsage[userID] / 1024).toFixed(2);
          console.log(`Received PONG for UserID: ${userID.green}, Used ${totalDataUsageKB.yellow} KB total packet data`.cyan);
          
          // 每次收到 PONG 后，间隔一段时间再发送下一个 PING
          setTimeout(() => {
            this.sendPing(wsClient, proxyDetails.ip);
          }, 30000); // 30秒后发送下一个 PING
        }
      };

      wsClient.onclose = (event) => {
        console.log(`WebSocket closed for userID: ${userID}`.red);
        console.log(`Close code: ${event.code}, reason: ${event.reason}`.red);
        setTimeout(() => {
          console.log(`Attempting to reconnect for userID: ${userID}`.yellow);
          this.proxyConnect(proxy, userID)
        }, this.configuration.retryInterval);
      };

      wsClient.onerror = (error) => {
        console.error(`WebSocket error for userID: ${userID}`.red);
        console.error(`Error details: ${error.message}`.red);
        if (error.error) {
          console.error(`Additional error info: ${error.error}`.red);
        }
        wsClient.terminate();
      };
    } catch (error) {
      console.error(`Proxy: ${error.message}`.red);
    }
  }

  sendPing(wsClient, proxyIP) {
    const id = Math.random().toString(36).substring(2, 5); // 生成3位随机ID
    const pingMessage = {
      id: id,
      version: '1.0.0',
      action: 'PING',
      data: {}
    };
    console.log(`Send PING with ID: ${id} from ${proxyIP}`.green);
    console.log(`PING message: ${JSON.stringify(pingMessage, null, 2)}`.gray);
    wsClient.send(JSON.stringify(pingMessage));
  }

  defaultHeaders() {
    return {
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Origin': 'chrome-extension://lehaonighjjimmpnagapkhpcdbhclfg',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
      'Sec-Websocket-Extensions': 'permessage-deflate; client_max_window_bits',
      'Sec-Websocket-Version': '13'
    };
  }

  getProxyAgent(proxy) {
    return new HttpsProxyAgent(proxy);
  }

  async getProxyDetails(proxy) {
    const agent = new HttpsProxyAgent(proxy);
    try {
      const response = await request.get(this.configuration.ipCheckURL, {
        httpsAgent: agent,
      });
      console.log(`\x1b[92mConnected with proxy \x1b[32m${proxy}\x1b[0m`);
      return response.data;
    } catch (error) {
      console.error(`Proxy error, skipping proxy ${proxy}`.yellow);
      return null;
    }
  }
}

class Configuration {
  constructor() {
    this.ipCheckURL = 'https://ipinfo.io/json';
    this.websocketHost = 'proxy2.wynd.network:4650';
    this.retryInterval = 20000;
  }
}

async function loadLines(filePath) {
  return new Promise((resolve, reject) => {
    fileSystem.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }
      resolve(data.split('\n').filter(line => line.trim() !== ''));
    });
  });
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}