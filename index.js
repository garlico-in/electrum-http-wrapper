import fastify from 'fastify';
import {ElectrumClient} from '@samouraiwallet/electrum-client';
import garlicoinjs from 'garlicoinjs-lib';
import os from 'os';

let seedServer
let client
let clientMap
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
          // Mask the hostname with a hash
          hostname: garlicoinjs.crypto.sha1(request.hostname).toString('hex'),
          // Mask the IP address with a hash
          remoteAddress: garlicoinjs.crypto.sha1(request.ip).toString('hex'),
          remotePort: request.socket.remotePort
        }
      }
    }
  }
});

async function initServer() {

  if (os.hostname() === 'batcave.garlico.in') {
    console.info('Hostname is batcave.garlico.in');
    seedServer = 'electrumx.garlico.in'
  } else {
    console.info('Hostname is not batcave.garlico.in');
    seedServer = 'electrum.test.digital-assets.local'
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
    fastify.log.error(error);
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
    fastify.log.info(`The best Electrum server is ${bestServer} with an average response time of ${bestResponseTime.toFixed(2)}ms`);
    fastify.log.info('Changing the global Electrum client to ${bestServer}')

    // Change the global Electrum client to the best server
    try{
      client = electrumClientsMap.get(bestServer);
      fastify.log.info('Global Electrum client changed successfully.')
    }catch(error){
      fastify.log.error(error);
      fastify.log.error('Failed to change global Electrum client.')
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
  }
})

server.get('/GRLC/mainnet/tx/:txid', async (request, reply) => {
  const txid = request.params.txid
  try {
      let response = 'https://explorer.grlc.eu/get.php?q=' + txid;
      reply.redirect(response);
  } catch (error) {
      reply.send(error);
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

