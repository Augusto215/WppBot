const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const port = process.env.PORT || 8000;
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const dialogflow = require('@google-cloud/dialogflow');
const sessionClient = new dialogflow.SessionsClient({keyFilename: 'alphabot-oijq-6b10175b9cfe.json'});

let botActiveInChats = {};

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

      if (isBlank(intentResponse.queryResult.fulfillmentText)){
        console.log('Sem resposta definida no DialogFlow');
        return null;   
      } else {
        console.log('Resposta definida no DialogFlow');
        return JSON.stringify(intentResponse.queryResult.fulfillmentMessages);
      }
    } catch (error) {
      console.log(error);
    }
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ debug: true }));
app.use("/", express.static(__dirname + "/"))

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: __dirname });
});

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'nick' }),
  puppeteer: { 
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', 
      '--disable-gpu'
    ] 
  }
});

client.initialize();

io.on('connection', function(socket) {
  socket.emit('message', '© BOT-ZDG - Iniciado');
  socket.emit('qr', './icon.svg');

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', '© BOT-ZDG QRCode recebido, aponte a câmera  seu celular!');
    });
  });

  client.on('ready', () => {
    socket.emit('ready', '© BOT-ZDG Dispositivo pronto!');
    socket.emit('message', '© BOT-ZDG Dispositivo pronto!');
    socket.emit('qr', './check.svg') 
    console.log('© BOT-ZDG Dispositivo pronto');
  });

  client.on('authenticated', () => {
    socket.emit('authenticated', '© BOT-ZDG Autenticado!');
    socket.emit('message', '© BOT-ZDG Autenticado!');
    console.log('© BOT-ZDG Autenticado');
  });

  client.on('auth_failure', function() {
    socket.emit('message', '© BOT-ZDG Falha na autenticação, reiniciando...');
    console.error('© BOT-ZDG Falha na autenticação');
  });

  client.on('change_state', state => {
    console.log('© BOT-ZDG Status de conexão: ', state );
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', '© BOT-ZDG Cliente desconectado!');
    console.log('© BOT-ZDG Cliente desconectado', reason);
    client.initialize();
  });
});

client.on('message', async msg => {
  console.log('Mensagem recebida', msg);

  if (msg.from.endsWith('@g.us')) {
    return;
  }

  if (msg.body === '3' || msg.body === '4' || msg.body === '5' || msg.body === '6' || msg.body === '7' || msg.body === '8' || msg.body === '9' || msg.body === '10' ) {
    botActiveInChats[msg.from] = false;
    await client.sendMessage(msg.from, `Entendido! Você será redirecionado para um de nossos atendentes😊(Bot Desativado)`);
    return;

  } else if (msg.body === '!ativar') {
    await msg.reply('Bot - Ativado!');
    botActiveInChats[msg.from] = true;
    return;
  }

  if (botActiveInChats[msg.from] === false) {
    return;
  }

  try {
    let textoResposta = await executeQueries('alphabot-oijq', msg.from, [msg.body], 'pt-br');
    if (textoResposta !== null) {
      try {
        for (const message of JSON.parse(textoResposta)) {
          try {
            const texto = JSON.stringify(message.text.text).replace('["', '').replace('"]', '');
            msg.reply("*Nick-BOT:*\n" + texto.replace(/\\n/g, '\n'));
          } catch (e) {
            console.log('Nick-BOT: error ' + e);
          }
        }
      } catch (e) {
        console.log('Error parsing JSON response: ' + e);
      }
    }
  } catch (e) {
    console.log('Error executing queries: ' + e);
  }
});

app.post('/sendMessage', [
  body('number').notEmpty().withMessage('Número é necessário'),
  body('message').notEmpty().withMessage('Mensagem é necessária')
], async (req, res) => {
  const errors = validationResult(req).array();
  const number = req.body.number;
  const message = req.body.message;

  if (errors.length > 0) {
    const alert = errors.map(error => `[${error.param}]: ${error.msg}`);
    return res.status(422).jsonp(alert);
  }

  const numberWhitCountryCode = number.replace('@c.us', '');
  const isRegisteredNumber = await client.isRegisteredUser(numberWhitCountryCode+'@c.us');

  if (!isRegisteredNumber) {
    return res.status(422).send({ message: "O número não está registrado" });
  }

  client.sendMessage(numberWhitCountryCode+'@c.us', message);

  res.status(200).send({message: 'Mensagem enviada com sucesso'});
});

server.listen(port, function() {
  console.log('© BOT-ZDG funcionando na porta: ' + port);
});
