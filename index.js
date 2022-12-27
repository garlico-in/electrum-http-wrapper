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
          hostname: request.hostname,
          remoteAddress: request.ip,
          remotePort: request.socket.remotePort
        }
      }
    }
  }
});

// Create a new Electrum client
const client = new ElectrumClient(50002, 'electrum.test.digital-assets.local', 'tls');

try {
  client.initElectrum({client: 'electrum-client-js', version: ['1.2', '1.4']}, {
    retryPeriod: 5000,
    maxRetry: 10,
    pingPeriod: 5000,
});

}catch(error){
  console.log(error);
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
    const response = await client.blockchainScripthash_getBalance(scripthash);

    // Send the response from the ElectrumX server back to the client
    reply.send(response);
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

