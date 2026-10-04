// Prints a new ES256 key pair's private key as an AGENT_TOKEN_PRIVATE_KEY line for .env.local
// (PEM with its line breaks written as \n). The public key needs no copying: /api/agent/jwks
// derives it from the private one.
import { generateKeyPairSync } from "node:crypto"

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim()
console.log(`AGENT_TOKEN_PRIVATE_KEY="${pem.replace(/\n/g, "\\n")}"`)
