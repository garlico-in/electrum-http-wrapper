const fastify = require('fastify')({
  logger: true
});
import {ElectrumClient} from '@samouraiwallet/electrum-client';

const electrum = new ElectrumClient('ssl://electrum.test.digital-assets.local:50002');

function convertToScripthash(address) {
  // First, decode the base58-encoded address
  const decoded = base58.decode(address);

  // Next, take the first 4 bytes of the decoded address and reverse the order
  const scripthash = decoded.slice(0, 4).reverse();

  // Finally, encode the scripthash in hexadecimal format
  return scripthash.toString('hex');
}

fastify.post('/api/GRLC/mainnet/tx/send', async (request, reply) => {
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

fastify.get('/api/GRLC/mainnet/address/:address/balance', async (request, reply) => {
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

// Start the server
fastify.listen(3000, (err, address) => {
  if (err) throw err;
  fastify.log.info(`server listening on ${address}`);
});

