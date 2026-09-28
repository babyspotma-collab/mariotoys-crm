// Vérification rapide : npx tsx lib/forcelog.check.ts
// Rejoue la vraie réponse AddParcel (commande #7409) avec un faux fetch.
import assert from "node:assert";
import { addParcel, createPickupRequest, forcelogMessageFr } from "./forcelog";

const reply = (body: unknown) => (globalThis.fetch = (async () => new Response(JSON.stringify(body))) as typeof fetch);
const replyText = (text: string) => (globalThis.fetch = (async () => new Response(text)) as typeof fetch);
process.env.FORCELOG_API_KEY ||= "test";
const input = { orderNum: "#7409", receiver: "x", phone: "0600000000", city: "CSA", address: "x", cod: 430, productNature: "x" };

(async () => {
  reply({
    AUTH: { RESULT: "SUCCESS" },
    "ADD-PARCEL": { RESULT: "SUCCESS", IS_DOUBLE: 0, "NEW-PARCEL": { TRACKING_NUMBER: "F-CSA3A9DWNB38", ORDER_NUM: "#7409" } },
  });
  assert.deepEqual(await addParcel(input).then(({ code, isDouble }) => ({ code, isDouble })), { code: "F-CSA3A9DWNB38", isDouble: false });

  reply({ "ADD-PARCEL": { RESULT: "SUCCESS", IS_DOUBLE: 1, "NEW-PARCEL": { TRACKING_NUMBER: "F-X" } } });
  assert.equal((await addParcel(input)).isDouble, true);

  reply({ "ADD-PARCEL": { RESULT: "ERROR", MESSAGE: "Ville invalide" } });
  await assert.rejects(addParcel(input), /Ville invalide/);
  reply({ "ADD-PARCEL": { RESULT: "ERROR", MESSAGE: "Parcel product nature exceeded max chars: 100" } });
  await assert.rejects(addParcel(input), { message: "Nature du produit trop longue (100 caractères max)." });
  assert.equal(forcelogMessageFr("Parcel address exceeded max chars: 150"), "Adresse trop longue (150 caractères max).");
  assert.equal(forcelogMessageFr("Parcel code Not Found"), "Colis introuvable chez Forcelog.");
  // Ramassage : réponse de la doc, avec sa virgule finale.
  replyText('{ "ADD-PICKUP": { "RESULT": "SUCCESS", "MESSAGE": "New Pickup request created successfully", } }');
  assert.equal(await createPickupRequest({ phone: "0600000000", city: "CSA", address: "x" }), "New Pickup request created successfully");
  reply({ "ADD-PICKUP": { RESULT: "ERROR", MESSAGE: "City not found" } });
  await assert.rejects(createPickupRequest({ phone: "0600000000", city: "?", address: "x" }), /City not found/);
  console.log("forcelog checks OK");
})();
