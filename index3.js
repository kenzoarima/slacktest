const { App, ExpressReceiver, LogLevel } = require('@slack/bolt');
require('dotenv').config();

const port = Number(process.env.PORT) || 3000;

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // Keep the default Bolt events endpoint available.
  endpoints: '/slack/events',
  processBeforeResponse: true,
});

const boltApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  logLevel: LogLevel.INFO,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSlackBody(body) {
  if (typeof body === 'string') {
    const parsed = Object.fromEntries(new URLSearchParams(body));
    return parsed;
  }

  if (body && typeof body.payload === 'string') {
    try {
      return JSON.parse(body.payload);
    } catch {
      return body;
    }
  }
  return body;
}

async function postToSlack(responseUrl, payload, fallbackChannelId) {
  if (responseUrl) {
    try {
      const response = await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.error('Failed posting delayed response via response_url:', response.status, responseText);
      }
      return;
    } catch (error) {
      console.error('Error posting delayed response via response_url:', error.message || error);
    }
  }

  if (fallbackChannelId) {
    try {
      await boltApp.client.chat.postMessage({
        channel: fallbackChannelId,
        text: payload.text || 'Delayed response',
      });
    } catch (error) {
      console.error('Failed posting delayed response via chat.postMessage:', error.message || error);
    }
  }
}

async function handleSlackEndpoint(req, res, endpointName) {
  const payload = parseSlackBody(req.body);

  // Support Slack URL verification payloads if this endpoint is used for events setup.
  if (payload && payload.type === 'url_verification' && payload.challenge) {
    return res.status(200).send(payload.challenge);
  }

  if (endpointName === '/slacktest') {
    // Immediate ack to satisfy Slack timeout requirement.
    res.status(200).json({
      response_type: 'ephemeral',
      text: 'Received. I will send a follow-up message in 10 seconds.',
    });

    try {
      await sleep(10000);

      const delayedText = payload && payload.user_id
        ? `<@${payload.user_id}> Delayed response from /slacktest after 10 seconds.`
        : 'Delayed response from /slacktest after 10 seconds.';

      await postToSlack(
        payload && payload.response_url,
        {
          response_type: 'in_channel',
          text: delayedText,
        },
        payload && payload.channel_id,
      );
    } catch (error) {
      console.error('Failed delayed /slacktest handling:', error.message || error);
    }

    return;
  }

  console.log(`[${endpointName}] Incoming payload:`, payload);

  return res.status(200).json({
    ok: true,
    endpoint: endpointName,
    message: `Received request on ${endpointName}`,
    receivedAt: new Date().toISOString(),
  });
}

receiver.router.post('/slacktest', async (req, res) => {
  await handleSlackEndpoint(req, res, '/slacktest');
});

receiver.router.post('/slacktest2', async (req, res) => {
  await handleSlackEndpoint(req, res, '/slacktest2');
});

// Optional health check for local verification.
receiver.router.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});

(async () => {
  await boltApp.start(port);
  console.log(`Slack Bolt app is listening on port ${port}`);
  console.log(`POST endpoint ready: /slacktest`);
  console.log(`POST endpoint ready: /slacktest2`);
})();
