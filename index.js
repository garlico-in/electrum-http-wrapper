import fastify from 'fastify';
import ElectrumClient from 'electrum-client-js';
import garlicoinjs from 'garlicoinjs-lib';

// Create a new Fastify server
const server = fastify({logger: true});

let electrum;

try{
  electrum = new ElectrumClient(50002, 'electrum.test.digital-assets.local', 'ssl');
  console.log('Connected to electrum server!');
}catch(e){
  console.log(e);
}

setInterval(async () => {
  try {
    await electrum.server_ping();
  } catch (error) {
    console.log(error);
    console.log('Reconnecting to electrum server...');
    electrum = new ElectrumClient(50002, 'electrum.test.digital-assets.local', 'ssl');
    console.log('Connected to electrum server!');
    console.log('Pinging server...');
    try{
      await electrum.server_ping();
      console.log('Server pinged successfully!');
    }catch(e){
      console.log(e);
      console.log('Server ping failed!');
    }
  }
}, 15000);

function convertToScripthash(address) {
  
  return garlicoinjs.address.toOutputScript(address);

}

server.post('/api/GRLC/mainnet/tx/send', async (request, reply) => {
  // Log the request id
  console.log(request.id)

  // Parse the raw transaction from the request body
  const rawTransaction = request.body;

  // Connect to the ElectrumX server and send the transaction
  try {
    const response = await electrum.blockchainTransaction_broadcast(rawTransaction);

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
    const response = await electrum.blockchainScripthash_getBalance(scripthash);

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
    const response = await electrum.blockchainScripthash_listunspent(scripthash);

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

