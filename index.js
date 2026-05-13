const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const mcpUrl = 'https://mcp.newrelic.com/mcp/';
const NEW_RELIC_MCP_RPC_METHOD = 'tools/call'; //process.env.NEW_RELIC_MCP_RPC_METHOD || 'processInput';
const NEW_RELIC_USER_KEY = 'NRAK-xxx';
var NEW_RELIC_ACCOUNT_ID = '8888';


app.use(express.json());

async function callNewRelicMcpServer(input) {
  if (!mcpUrl) {
    throw new Error('NEW_RELIC_MCP_URL is not configured');
  }

  if (typeof input !== 'object' || input === null) {
    throw new Error('Input must be a valid JSON object');
  }

  const rpcMethod = NEW_RELIC_MCP_RPC_METHOD;
  const rpcId = `${Date.now()}`;
  const rpcPayload = {
    jsonrpc: '2.0',
    id: rpcId,
    method: rpcMethod,
    params: input,
    // {
    //   input, // Pass the JSON object directly
    // },
  };

  // console.log('test 1', rpcPayload);
  // console.log('test 2', JSON.stringify(rpcPayload));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'api-key': NEW_RELIC_USER_KEY
      },
      body: JSON.stringify(rpcPayload),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    if (!response.ok) {
      const error = new Error('New Relic MCP server returned a non-success response');
      error.status = response.status;
      error.payload = parsed;
      throw error;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      const error = new Error('Invalid JSON-RPC response from New Relic MCP server');
      error.status = 502;
      error.payload = parsed;
      throw error;
    }

    if (parsed.error) {
      const error = new Error(parsed.error.message || 'New Relic MCP JSON-RPC error');
      error.status = 502;
      error.payload = parsed.error;
      throw error;
    }

    return parsed.result;
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/slack/test', (req, res) => {
  res.status(200).json({
    ok: true,
    endpoint: '/slack/test',
    message: 'Slack test endpoint is working',
    timestamp: new Date().toISOString(),
  });
});

app.post('/slack/test2', async (req, res) => {
  //const rawInput = req.body?.input ?? req.query?.input;

  const rawInput = {
      "name": "natural_language_to_nrql_query",
      "arguments": {
        "user_request": "Are there any errors in the last 30 minutes?",
        "account_id": NEW_RELIC_ACCOUNT_ID
      }
    };

//   if (typeof rawInput !== 'string' || rawInput.trim().length === 0) {
//     res.status(400).json({
//       ok: false,
//       endpoint: '/slack/test2',
//       error: 'Provide a non-empty string in body.input or query input',
//     });
//     return;
//   }

  try {
    const mcpOutput = await callNewRelicMcpServer(rawInput);

    res.status(200).json({
      ok: true,
      endpoint: '/slack/test2',
      input: JSON.stringify(rawInput),
      mcpOutput,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;

    res.status(status).json({
      ok: false,
      endpoint: '/slack/test2',
      error: error.message || 'Failed to call New Relic MCP server',
      mcpError: error.payload ?? null,
    });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
