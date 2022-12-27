import fastify from 'fastify';
import {ElectrumClient} from '@samouraiwallet/electrum-client';
import garlicoinjs from 'garlicoinjs-lib';

// Create a new Fastify server
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
          headers: request.headers,
          hostname: garlicoinjs.crypto.sha1(request.hostname),
          remoteAddress: garlicoinjs.crypto.sha1(request.ip),
          remotePort: request.socket.remotePort
        }
      }
    }
  }
});

// Create the initial Electrum client
const client = new ElectrumClient(50002, 'electrumx.garlico.in', 'tls');

// Connect to the ElectrumX server
try {
  client.initElectrum({client: 'electrum-client-js', version: ['1.2', '1.4']}, {
    retryPeriod: 5000,
    maxRetry: 10,
    pingPeriod: 5000,
});

}catch(error){
  console.log(error);
}

const clientMap = await buildClientMap();

// A helper function to build a map of Electrum clients
async function buildClientMap() {
  const tempClientMap = new Map();
  tempClientMap.set('electrumx.garlico.in', client);

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
      console.log(error);
    }
  }

  // Connect to each ElectrumX server
  unconnectedClients.forEach((value, key) => {
    try {

      value.initElectrum({client: 'electrum-client-js', version: ['1.2', '1.4']}, {
        retryPeriod: 5000,
        maxRetry: 10,
        pingPeriod: 5000,
      });
      tempClientMap.set(key, value)

    } catch (error) {
      console.log(`Failed to connect to server ${key}:50002`)
    }

  });

  console.log(`Connected to ${tempClientMap.size} servers.`)
  
  // Return the map of good Electrum clients
  return tempClientMap;
}

// A helper function to convert a garlicoin address to a scripthash
function convertToScripthash(address) {
  
  let script = garlicoinjs.address.toOutputScript(address);
  let hash = garlicoinjs.crypto.sha256(script);
  return Buffer.from(hash.reverse()).toString('hex');

}

// A route that sends a raw transaction to the ElectrumX server
server.post('/api/GRLC/mainnet/tx/send', async (request, reply) => {

  // Parse the raw transaction from the request body
  const rawTransaction = request.body;

  // Connect to the ElectrumX server and send the transaction
  try {
    const response = await client.blockchainTransaction_broadcast(rawTransaction);

    // Send the response from the ElectrumX server back to the client
    reply.send(response);
  } catch (error) {
    reply.send(error);
  }
});

// A route that gets the balance of a garlicoin address
server.get('/api/GRLC/mainnet/address/:address/balance', async (request, reply) => {
  
  // Get the garlicoin address from the request parameters
  const address = request.params.address

  // Convert the address to a scripthash
  const scripthash = convertToScripthash(address);

  // Connect to the ElectrumX server and send the transaction
  try {
    
    const responses = await Promise.all(clientMap.forEach(client => {
      console.log('client:', client);
      return client.blockchainScripthash_getBalance(scripthash);
    }));

    const response = responses.find(r => r.success);
    if (response) {
        reply.send(response);
    } else {
        throw 'Failed to get balance from any server.' 
    }

    // Send the response from the ElectrumX server back to the client
  } catch (error) {
    reply.send(error);
  }
})

// A route that gets the unspent outputs of a garlicoin address
server.get('/api/GRLC/mainnet/address/:address*', async (request, reply) => {

  // Get the garlicoin address from the request parameters
  const address = request.params.address

  // Convert the address to a scripthash
  const scripthash = convertToScripthash(address);

  // Connect to the ElectrumX server and get unspent outputs
  try {
    const response = await client.blockchainScripthash_listunspent(scripthash);

    // Send the response from the ElectrumX server back to the client
    reply.send(response);
  } catch (error) {
    reply.send(error);
  }
})

server.get('/api/GRLC/mainnet/peers', async (request, reply) => {

  // Connect to the ElectrumX server and get list of peers
  try {
    const response = await client.serverPeers_subscribe();

    // Send the response from the ElectrumX server back to the client
    reply.send(response);
  } catch (error) {
    reply.send(error);
  }
})

// A route that responds to health checks
server.get('/healthcheck', async (request, reply) => {

  reply.code(200).send()

})

// Start the server
server.listen({ port: 3000, host: '0.0.0.0' }, async (error, address) => {

  if (error) {
    console.error(error);
    process.exit(1);
  }

  server.log.info(`Server listening on ${address}`);

});

