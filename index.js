import fastify from 'fastify';
import {ElectrumClient} from '@samouraiwallet/electrum-client';
import garlicoinjs from 'garlicoinjs-lib';

// Create a new Fastify server
const server = fastify({logger: true});
const client = new ElectrumClient(50002, 'uk.garlium.crapules.org', 'tls');
try {
  client.initElectrum({client: 'electrum-client-js', version: ['1.2', '1.4']}, {
    retryPeriod: 5000,
    maxRetry: 10,
    pingPeriod: 5000,
});
}catch(error){
  console.log(error);
}

function convertToScripthash(address) {
  
  let script = garlicoinjs.address.toOutputScript(address);
  let hash = garlicoinjs.crypto.sha256(script);
  return Buffer.from(hash.reverse()).toString('hex');

}

server.post('/api/GRLC/mainnet/tx/send', async (request, reply) => {
  // Log the request id
  console.log(request.id)

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

server.get('/api/GRLC/mainnet/address/:address/balance', async (request, reply) => {
  // Log the request id
  console.log(request.id)
  
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

server.get('/api/GRLC/mainnet/address/:address/?unspent=true&limit=0', async (request, reply) => {
  // Log the request id
  console.log(request.id)

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

server.get('/healthcheck', async (request, reply) => {
  // Log the request id
  console.log(request.id)

  reply.code(200).send()
})

// Start the server
server.listen({ port: 3000, host: '0.0.0.0' }, async (error, address) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }
  server.log.info(`server listening on ${address}`);
});

