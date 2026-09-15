#!/usr/bin/env node
'use strict';

/**
 * Enregistre le webhook Shopify orders/create une fois le projet déployé.
 *
 * Usage :
 *   node scripts/register-webhook.js https://mario-toys-crm.vercel.app
 *
 * Utilise les identifiants OAuth client-credentials Shopify (SHOPIFY_STORE,
 * SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET) définis dans .env.
 */

require('dotenv').config();

const STORE = process.env.SHOPIFY_STORE;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const API_VERSION = '2024-07';

async function getAccessToken() {
  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`Auth échouée (${res.status}): ${await res.text()}`);
  const data = await res.json();
  if (!data.access_token) throw new Error(`Pas de token: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function main() {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error('❌ Usage : node scripts/register-webhook.js https://votre-domaine.vercel.app');
    process.exit(1);
  }
  if (!STORE || !CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Variables manquantes : SHOPIFY_STORE, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET');
    process.exit(1);
  }

  const address = `${baseUrl.replace(/\/$/, '')}/api/webhooks/shopify/orders-create`;

  console.log('🔐 Récupération du token OAuth...');
  const token = await getAccessToken();

  console.log(`📡 Enregistrement du webhook orders/create → ${address}`);
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/webhooks.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({
      webhook: { topic: 'orders/create', address, format: 'json' },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('❌ Erreur Shopify :', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('✅ Webhook enregistré :', JSON.stringify(data.webhook, null, 2));
}

main().catch((err) => {
  console.error('❌ Erreur :', err.message);
  process.exit(1);
});
