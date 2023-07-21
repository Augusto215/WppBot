const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fileUpload = require('express-fileupload');
const port = process.env.PORT || 8000;
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const { WebhookClient } = require('dialogflow-fulfillment');
const dialogflow = require('@google-cloud/dialogflow');
const sessionClient = new dialogflow.SessionsClient({ keyFilename: 'alphabot-oijq-6b10175b9cfe.json' });
const fs = require('fs');

const dirBot = './bot';

if (!fs.existsSync(dirBot)) {
  fs.mkdirSync(dirBot);
}

app.post('/webhook', function (request, response) {
  const agent = new WebhookClient({ request, response });

  let intentMap = new Map();
  intentMap.set('nomedaintencao', nomedafuncao);
  agent.handleRequest(intentMap);
});

function nomedafuncao(agent) {
}

function isBlank(str) {
  return (!str || /^\s*$/.test(str));
}

async function detectIntent(
  projectId,
  sessionId,
  query,
  contexts,
  languageCode
) {
  const sessionPath = sessionClient.projectAgentSessionPath(
    projectId,
    sessionId
  );

  // The text query request.
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: query,
        languageCode: languageCode,
      },
    },
  };

  if (contexts && contexts.length > 0) {
    request.queryParams = {
      contexts: contexts,
    };
  }

  const responses = await sessionClient.detectIntent(request);
  return responses[0];
}

async function executeQueries(projectId, sessionId, queries, languageCode) {
  let context;
  let intentResponse;
  for (const query of queries) {
    try {
      console.log(`Pergunta: ${query}`);
      intentResponse = await detectIntent(
        projectId,
        sessionId,
        query,
        context,
        languageCode
      );

      if (isBlank(intentResponse.queryResult.fulfillmentText)) {
        console.log('Sem resposta definida no DialogFlow');
        return null;
      } else {
        console.log('Resposta definida no DialogFlow');
        console.log(intentResponse.queryResult.fulfillmentText);
        console.log(intentResponse.queryResult.fulfillmentMessages);
        return JSON.stringify(intentResponse.queryResult.fulfillmentMessages);
      }
    } catch (error) {
      console.log('Erro ao chamar o DialogFlow:', error);
      return null;
    }
  }
}

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use(fileUpload({
  debug: true
}));
app.use("/", express.static(__dirname + "/"));

app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'Nick-Bot' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ]
  }
});

client.initialize();

io.on('connection', function (socket) {
  socket.emit('message', '© BOT-ZDG - Iniciado');
  socket.emit('qr', './icon.svg');

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', '© BOT-ZDG QRCode recebido, aponte a câmera seu celular!');
    });
  });

  client.on('ready', () => {
    socket.emit('ready', '© BOT-ZDG Dispositivo pronto!');
    socket.emit('message', '© BOT-ZDG Dispositivo pronto!');
    socket.emit('qr', './check.svg');
    console.log('© BOT-ZDG Dispositivo pronto');
  });

  client.on('authenticated', () => {
    socket.emit('authenticated', '© BOT-ZDG Autenticado!');
    socket.emit('message', '© BOT-ZDG Autenticado!');
    console.log('© BOT-ZDG Autenticado');
  });

  client.on('auth_failure', function () {
    socket.emit('message', '© BOT-ZDG Falha na autenticação, reiniciando...');
    console.error('© BOT-ZDG Falha na autenticação');
  });

  client.on('change_state', state => {
    console.log('© BOT-ZDG Status de conexão: ', state);
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', '© BOT-ZDG Cliente desconectado!');
    console.log('© BOT-ZDG Cliente desconectado', reason);
    client.initialize();
  });
});

const timer = ms => new Promise(res => setTimeout(res, ms));

client.on('message', async msg => {
  // Verificar se a mensagem é de um grupo
  if (msg.from.includes('@g.us')) {
    // Se a mensagem é de um grupo, não processe
    console.log('Mensagem de um grupo, ignorando...');
    return;
  }

  console.log('Mensagem recebida', msg);

  const jid = msg.from;
  const dirFrom = './bot/' + jid.replace(/\D/g, '');
  const from = jid.replace(/\D/g, '');


  async function readWriteFileJson(botStatus) {
    let dataFile = [];
    const filePath = `./bot/${from}/bot.json`;
    fs.writeFileSync(filePath, JSON.stringify(dataFile));
    var data = fs.readFileSync(filePath);
    var myObject = JSON.parse(data);
    let newData = {
      status: botStatus,
    };
    await myObject.push(newData);
    fs.writeFileSync(filePath, JSON.stringify(myObject));
  }

  if (!fs.existsSync(dirFrom)) {
    fs.mkdirSync(dirFrom);
    await readWriteFileJson("on");
  }

  const status = fs.readFileSync(`./bot${from}/bot.json`, "utf8").split(':')[1].replace(/\W/g, '');

  if (msg.body === '3') {
    await readWriteFileJson("off");
    console.log('status off');
  }

  if (status === "off") {
    return;
  }

  if (status === "on") {
    let textoResposta = await executeQueries('alphabot-oijq', msg.from, [msg.body], 'pt-br');

    try {
      const parsedResponse = JSON.parse(textoResposta);

      for (const message of parsedResponse) {
        const texto = JSON.stringify(message.text.text).replace('["', '').replace('"]', '');
        msg.reply("*BOT ZDG:*\n" + texto.replace(/\\n/g, '\n'));
      
      }
    } catch (error) {
      console.error('Erro ao analisar a resposta do DialogFlow:', error);
    }
  }
});

server.listen(port, function () {
  console.log('App running on *:' + port);
});
