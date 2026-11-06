import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { issueChallenge, relyingParty, takeChallenge } from "@/lib/auth/session";
import { getPasskey, listPasskeyIds, markPasskeyUsed, savePasskey } from "@/lib/db/passkeys";

// Single owner, so the user handle is fixed. Face ID or Touch ID is required.
const OWNER_ID = new TextEncoder().encode("listener-owner");

/** "computer" asks the browser for the computer's own authenticator (Windows Hello, Touch ID), not a phone. */
export async function enrollmentOptions(device: "any" | "computer" = "any") {
  const { rpID } = await relyingParty();
  const existing = await listPasskeyIds();
  const challenge = await issueChallenge("enroll");
  return generateRegistrationOptions({
    rpName: "Listener",
    rpID,
    userID: OWNER_ID,
    userName: "owner",
    userDisplayName: "Listener owner",
    challenge: new TextEncoder().encode(challenge),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports as never })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
      ...(device === "computer" ? { authenticatorAttachment: "platform" as const } : {}),
    },
  });
}

export async function finishEnrollment(response: RegistrationResponseJSON): Promise<boolean> {
  const challenge = await takeChallenge("enroll");
  if (!challenge) return false;
  const { rpID, origin } = await relyingParty();
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: Buffer.from(challenge).toString("base64url"),
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  }).catch(() => null);
  if (!result?.verified) return false;
  const { credential } = result.registrationInfo;
  await savePasskey({
    id: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports ?? [],
  });
  return true;
}

/** Face ID prompt for signing in, or ("pair") for approving a computer from a signed in phone. */
export async function loginOptions(purpose: "login" | "pair" = "login") {
  const { rpID } = await relyingParty();
  const challenge = await issueChallenge(purpose);
  return generateAuthenticationOptions({
    rpID,
    challenge: new TextEncoder().encode(challenge),
    userVerification: "required",
    allowCredentials: [],
  });
}

export async function finishLogin(response: AuthenticationResponseJSON, purpose: "login" | "pair" = "login"): Promise<boolean> {
  const challenge = await takeChallenge(purpose);
  if (!challenge || typeof response?.id !== "string") return false;
  const stored = await getPasskey(response.id);
  if (!stored) return false;
  const { rpID, origin } = await relyingParty();
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: Buffer.from(challenge).toString("base64url"),
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: { id: stored.id, publicKey: stored.publicKey as Uint8Array<ArrayBuffer>, counter: stored.counter, transports: stored.transports as never },
  }).catch(() => null);
  if (!result?.verified) return false;
  await markPasskeyUsed(stored.id, result.authenticationInfo.newCounter);
  return true;
}
