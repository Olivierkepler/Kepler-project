import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";

type TestUser = {
  email: string;
  passwordEnv: string;
};

const USERS: TestUser[] = [
  {
    email: "buildsigma-test-a@example.com",
    passwordEnv: "BUILDSIGMA_TEST_PASSWORD_A",
  },
  {
    email: "buildsigma-test-b@example.com",
    passwordEnv: "BUILDSIGMA_TEST_PASSWORD_B",
  },
];

async function ensureUser(email: string, password: string): Promise<string> {
  try {
    const existing = await getAuth().getUserByEmail(email);
    return existing.uid;
  } catch {
    const created = await getAuth().createUser({
      email,
      password,
      emailVerified: true,
      disabled: false,
    });
    return created.uid;
  }
}

async function main(): Promise<void> {
  for (const user of USERS) {
    const password = process.env[user.passwordEnv];

    if (!password || password.length < 8) {
      throw new Error(
        `${user.passwordEnv} must be set to a password of at least 8 characters`,
      );
    }

    const uid = await ensureUser(user.email, password);
    console.log(`OK ${user.email} uid=${uid}`);
  }
}

main().catch((error: unknown) => {
  console.error("ensureAuthUsers failed:");
  console.error(error);
  process.exitCode = 1;
});
