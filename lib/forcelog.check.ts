// Vérification rapide : npx tsx lib/forcelog.check.ts
// Rejoue la vraie réponse AddParcel (commande #7409) avec un faux fetch.
import assert from "node:assert";
import { addParcel } from "./forcelog";

const reply = (body: unknown) => (globalThis.fetch = (async () => new Response(JSON.stringify(body))) as typeof fetch);
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
  console.log("forcelog checks OK");
})();
