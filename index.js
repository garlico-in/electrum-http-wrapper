import fastify from 'fastify';
import {ElectrumClient} from '@samouraiwallet/electrum-client';

// Create a new Fastify server
const server = fastify({logger: true});

try{
  const electrum = new ElectrumClient(50002, 'electrum.test.digital-assets.local', 'ssl');
}catch(e){
  console.log(e);
}

function convertToScripthash(address) {
  // First, decode the base58-encoded address
  const decoded = base58.decode(address);

  // Next, take the first 4 bytes of the decoded address and reverse the order
  const scripthash = decoded.slice(0, 4).reverse();

  // Finally, encode the scripthash in hexadecimal format
  return scripthash.toString('hex');
}

server.post('/api/GRLC/mainnet/tx/send', async (request, reply) => {
  // Log the request id
  console.log(request.id)

  // Parse the raw transaction from the request body
  const rawTransaction = request.body;

  // Connect to the ElectrumX server and send the transaction
  try {
    const response = await electrum.request('blockchain.transaction.broadcast', rawTransaction);

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
    const response = await electrum.request('blockchain.scripthash.get_balance', scripthash);

    // Send the response from the ElectrumX server back to the client
    reply.send(response);
  } catch (error) {
    reply.send(error);
  }
})

server.get('/api/GRLC/mainnet/address/:address/unspent', async (request, reply) => {
  // Log the request id
  console.log(request.id)

  // Get the garlicoin address from the request parameters
  const address = request.params.address

  // Convert the address to a scripthash
  const scripthash = convertToScripthash(address);

  // Connect to the ElectrumX server and get unspent outputs
  try {
    const response = await electrum.request('blockchain.scripthash.listunspent', scripthash);

    // Send the response from the ElectrumX server back to the client
    reply.send(response);
  } catch (error) {
    reply.send(error);
  }
})

server.get('/api/GRLC/mainnet/tx/:txid', async (request, reply) => {
  // Log the request id
  console.log(request.id)

  // Get the transaction id from the request parameters
  const txid = request.params.txid

  // Create a link to the transaction on the blockchain explorer
  const link = `https://explorer.grlc.eu/tx.php?tx=${txid}`
  reply.send({ link })
})

server.get('/healthcheck', async (request, reply) => {
  // Log the request id
  console.log(request.id)
  
  reply.code(200).send()
})

// Start the server
server.listen(3000, (err, address) => {
  if (err) throw err;
  server.log.info(`server listening on ${address}`);
});

