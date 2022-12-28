import dotenv from 'dotenv';
dotenv.config()
import fastify from 'fastify';
import {ElectrumClient} from '@samouraiwallet/electrum-client';
import garlicoinjs from 'garlicoinjs-lib';
import fetch from 'node-fetch';
import os from 'os';
import fs from 'fs';

let seedServer
let client
let clientMap

const privateKey = fs.readFileSync('./privkey.pem', 'utf8');
const certificate = fs.readFileSync('./fullchain.pem', 'utf8');
const fcm_key = process.env.FCM_KEY;

const server = fastify({
  logger: {
    redact: ['req.headers.authorization'],
    level: 'debug',
    serializers: {
      req (request) {
        return {
          id: request.id,
          method: request.method,
          url: request.url,
          // TODO: remove headers with sensitive information
          headers: request.headers,
          //"x-forwarded-for": garlicoinjs.crypto.sha1(request.headers['x-forwarded-for']),
          // Mask the hostname with a hash
          hostname: garlicoinjs.crypto.sha1(request.hostname).toString('hex'),
          // Mask the IP address with a hash
          remoteAddress: garlicoinjs.crypto.sha1(request.ip).toString('hex'),
          remotePort: request.socket.remotePort
        }
      }
    }
  },
  https: {
    key: privateKey,
    cert: certificate
  }
});

async function initServer() {

  // Determine the seed server based on if test environment or not
  if (os.hostname() === 'batcave.garlico.in') {
    console.info('Hostname is batcave.garlico.in');
    console.info('Using seed server electrumx.garlico.in');
    seedServer = 'electrumx.garlico.in';
  } else {
    console.info('Hostname is not batcave.garlico.in');
    console.info('Host name: ' + os.hostname());
    console.info('Using seed server electrum.test.digital-assets.local');
    seedServer = 'electrum.test.digital-assets.local';
  }

  // Create the seed Electrum client
  try{
    client = new ElectrumClient(50002, seedServer, 'tls');
  }catch(error){
    console.error(error);
  }

  // Connect to the seed ElectrumX server
  try {
    client.initElectrum({client: 'electrum-client-js', version: ['1.2', '1.4']}, {
      retryPeriod: 5000,
      maxRetry: 10,
      pingPeriod: 300000,
  });

  // Set onError handler
  client.onerror = (error) => {
    console.error(`Electrum client error: ${error}`);
  }

  }catch(error){
    console.error(error);
  }

}

// Rebuild the map of Electrum clients at set intervals
async function rebuildClientMap(electrumClientsMap, interval) {
  setInterval(async () => {
    electrumClientsMap = await buildClientMap();
  }, interval);
}

// Check the best Electrum server at set intervals
async function checkBestElectrumServer(electrumClientsMap, interval) {
  setInterval(async () => {

    // Ping each server 3 times and take the average response time
    let bestServer = null;
    let bestResponseTime = Number.MAX_SAFE_INTEGER;
  
    // Loop through the Electrum clients
    for (const [name, client] of electrumClientsMap) {
      let totalResponseTime = 0;
  
      for (let i = 0; i < 3; i++) {
        try {
          const startTime = Date.now();
          await client.server_ping();
          const endTime = Date.now();
          const responseTime = endTime - startTime;
          totalResponseTime += responseTime;
        } catch (error) {
          console.error(`Error pinging Electrum server ${name}: ${error}`);
          totalResponseTime += 1000;
        }
      }
  
      const averageResponseTime = totalResponseTime / 3;
  
      if (averageResponseTime < bestResponseTime) {
        bestServer = name;
        bestResponseTime = averageResponseTime;
      }
    }
  
    // Set the best Electrum client as the global client
    console.info(`The best Electrum server is ${bestServer} with an average response time of ${bestResponseTime.toFixed(2)}ms`);
    console.info(`Changing the global Electrum client to ${bestServer}`)

    // Change the global Electrum client to the best server
    try{
      client = electrumClientsMap.get(bestServer);
      console.info('Global Electrum client changed successfully.')
    }catch(error){
      consoleerror(error);
      console.error('Failed to change global Electrum client.')
    }
  }, interval);
}


// A helper function to build a map of Electrum clients
async function buildClientMap() {
  const tempClientMap = new Map();
  tempClientMap.set(seedServer, client);

  // Get a list of ElectrumX servers from the server
  const peerList = await client.serverPeers_subscribe();

  const unconnectedClients = new Map()

  // Create an Electrum client for each server
  for (const peer of peerList) {

    try{

      if (peer.length > 2) {
        const newClient = new ElectrumClient(50002, peer[1], 'tls')
        unconnectedClients.set(peer[1], newClient)
      } else {
        const newClient = new ElectrumClient(50002, peer[0], 'tls')
        unconnectedClients.set(peer[0], newClient)
      }

    }catch(error){
      console.error(error);
    }
  }

  // Connect to each ElectrumX server and add it to the map on success
  unconnectedClients.forEach((value, key) => {
    try {

      value.initElectrum({client: 'electrum-client-js', version: ['1.2', '1.4']}, {
        retryPeriod: 5000,
        maxRetry: 10,
        pingPeriod: 300000,
      });

      // Set onError handler
      client.onerror = (error) => {
        console.error(`Electrum client error: ${error}`);
      }

      tempClientMap.set(key, value)

    } catch (error) {
      console.error(`Failed to connect to server ${key}:50002`)
    }

  });

  console.info(`Connected to ${tempClientMap.size} servers.`)
  
  // Return the map of goodElectrum clients
  return tempClientMap;
}

// A helper function to convert a garlicoin address to a scripthash
function convertToScripthash(address) {
  
  // Convert the address to a script using garlicoinjs
  let script = garlicoinjs.address.toOutputScript(address);
  let hash = garlicoinjs.crypto.sha256(script);
  return Buffer.from(hash.reverse()).toString('hex');

}

// A route that gets the balance of a garlicoin address
server.get('/api/GRLC/mainnet/address/:address/balance', async (request, reply) => {
  
  // Get the garlicoin address from the request parameters
  const address = request.params.address

  // Convert the address to a scripthash
  const scripthash = convertToScripthash(address);

  // Connect to the ElectrumX server and send the transaction
  try {
    const response = await client.blockchainScripthash_getBalance(scripthash);

    // Send the response from the ElectrumX server back to the client
    reply.send(response);
  } catch (error) {
    reply.send(error);
    fastify.log.erro(error);
  }
})

// A route that gets the unspent outputs of a garlicoin address
server.get('/api/GRLC/mainnet/address/:address/', async (request, reply) => {

    // Get the garlicoin address from the request parameters
    const address = request.params.address

    // Convert the address to a scripthash
    const scripthash = convertToScripthash(address);

    // Connect to the ElectrumX server and get unspent outputs
    try {
        const response = await client.blockchainScripthash_listunspent(scripthash);
        const utxos = response.map(function (utxo) {
            return {
                mintTxid: utxo.tx_hash,
                mintIndex: utxo.tx_pos,
                value: utxo.value
            };
        });

        // Send the response from the ElectrumX server back to the client
        reply.send(utxos);
    } catch (error) {
        reply.send(error);
        fastify.log.error(error)
    }

})

server.get('/api/GRLC/mainnet/peers', async (request, reply) => {

  // Connect to the ElectrumX server and get list of peers
  try {
    const response = Object.keys(clientMap);

    // Send the response from the ElectrumX server back to the client
    reply.send(response);
  } catch (error) {
    reply.send(error);
    fastify.log.error(error)
  }
})

// A route that responds to health checks
server.get('/healthcheck', async (request, reply) => {
  try{
    reply.code(200).send()  
  }catch(error){
    reply.code(500).send()
    fastify.log.error(error)
  }
})

// Remove hash # from url
server.get('/', async (request, reply) => {
  try {
      let response = '<script> const hash = window.location.hash;' +
          'if (hash.length > 0 && hash.includes("#/")) {' +
          'window.location.replace(window.location.href.replace("#/", ""));' +
          '} </script >';
      reply.type('text/html')
      reply.send(response);
  } catch (error) {
      reply.send(error);
      fastify.log.error(error)
  }
})

server.get('/GRLC/mainnet/tx/:txid', async (request, reply) => {
  const txid = request.params.txid
  try {
      let response = 'https://explorer.grlc.eu/get.php?q=' + txid;
      reply.redirect(response);
  } catch (error) {
      reply.send(error);
      fastify.log.error(error)
  }
})

// A route that sends a raw transaction to the ElectrumX server
server.post('/api/GRLC/mainnet/tx/send', async (request, reply) => {

  // Connect to the ElectrumX server and send the transaction
  try {
      // Parse the raw transaction from the request body
      const rawTransaction = request.body.rawTx;
      let response = await client.blockchainTransaction_broadcast(rawTransaction);
      response = { txid: response }

      // Send the response from the ElectrumX server back to the client
      reply.send(response);
  } catch (error) {
      reply.send(error);
      fastify.log.error(error)
  }
});

server.get('/gwl/delete/:token', async function (request, reply) {
  const token = request.params.token;
  fastify.log.info(`Delete request by: ${token}`)
  let topics;
  try {
      // Get all topics the token is subscribed to, in order to then delete them one by one
      let sub_topics = [];
      let response = await fetch(`https://iid.googleapis.com/iid/info/${token}?details=true`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Authorization': "key=" + fcm_key }
      });
      response = await response.json();
      topics = response.rel?.topics || [];
      for (let topic in topics) sub_topics.push(topic);
      if (response.error) {
          fastify.log.error("ERROR retrieving subscribed topics: " + response.error.toString());
          topics = "error";
      };
  } catch (e) {
      topics = "error";
      fastify.log.error("ERROR fetching subscribed topics: " + e.toString());
  }
  if (topics == "error") {
      reply.send({ success: false });
      return;
  }
  // Delete all topics the token is subscribed to
  try {
      if (topics) {
          for (let topic in topics) {
              let responseDelete = await fetch(`https://iid.googleapis.com/iid/v1/${token}/rel/topics/${topic}`, {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json', 'Authorization': "key=" + fcm_key }
              });
              if (responseDelete.error) log_events("ERROR deleting topics: " + responseDelete.error.toString());
          }
      }
      reply.send({ success: true });
      return;
  } catch (e) {
      log_events("ERROR fetch deleting topics: " + e.toString());
      reply.send({ success: false });
      return;
  }
});

server.get('/gwl/subscribe/:token/:address', async function (request, reply) {
  const token = request.params.token;
  const address = request.params.address;
  log_events(`Subscribe request by: ${token}`)
  try {
      // Subscribe the token to the topic (address)
      let response = await fetch(`https://iid.googleapis.com/iid/v1/${token}/rel/topics/${address}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': "key=" + fcm_key }
      });
      response = await response.json();
      if (response.error) {
          log_events("ERROR subscribing to topic: " + response.error.toString());
          reply.send({ success: false });
          return;
      }
      reply.send({ success: true });
      return;
  } catch (e) {
      log_events("ERROR fetch subscribing to topic: " + e.toString());
      reply.send({ success: false });
      return;
  }
});

// Start the server
server.listen({ port: 3000, host: '0.0.0.0' }, async (error, address) => {

  if (error) {
    console.error(error);
    process.exit(1);
  }

  // Handles initial electrum client connection
  initServer();

  // Build a map of Electrum clients
  clientMap = await buildClientMap();

  // Check the best ElectrumX server every 60 seconds
  checkBestElectrumServer(clientMap, 300000);
  rebuildClientMap(clientMap, 3600000);
  server.log.info(`Server listening on ${address}`);

});

