import supertest from 'supertest';

let accessToken = '';

// User info
const name = 'test';
const email = 'test@noreply.io';
const password = 'password';
const deviceName = 'jest';
const secret2FA = 'fake-secret';
const secretChangePass = 'fake-secret';

jest.mock('otplib', () => ({
  __esModule: true,
  authenticator: {
    check: () => true,
    generateSecret: () => secret2FA,
  },
  hotp: {
    check: () => true,
    generate: () => secretChangePass,
  },
}));

beforeAll(async () => {
  await global.startDb();
  await global.startServer();
});

afterAll(async () => {
  await global.server.stop();
  await global.db.dropDatabase();
  await global.db.close();
  await global.stopRedis();
});

it('create account', async () => {
  const query = `mutation CreateAccount($user: CreateAccountInput) {
    createAccount(data: $user) {
      user {
        name
        email
      }
      token
    }
  }`;

  const request = supertest(global.serverUrl).post('graphql');
  const response = await request.send({
    query,
    variables: {
      user: {
        name,
        email,
        password,
        deviceName,
      },
    },
  });

  expect(response.status).toEqual(200);
  expect(response.body.data.createAccount.token).toBeDefined();
  expect(response.body.data.createAccount.user).toEqual({ name, email });
});

it('sign in', async () => {
  const query = `mutation SignIn($user: SignInInput) {
    signIn(data: $user) {
      user {
        name
        email
      }
      token
      is2FAEnabled
    }
  }`;

  const request = supertest(global.serverUrl).post('graphql');
  const response = await request.send({
    query,
    variables: {
      user: {
        email,
        password,
        deviceName,
      },
    },
  });

  expect(response.status).toEqual(200);
  expect(response.body.data.signIn.token).toBeDefined();
  expect(response.body.data.signIn.user).toEqual({ name, email });
  expect(response.body.data.signIn.is2FAEnabled).toEqual(false);

  accessToken = response.body.data.signIn.token;
});

it('send code to email with forgot password', async () => {
  const query = `mutation ForgotPassword($email: String!) {
    forgotPassword(email: $email)
  }`;

  const request = supertest(global.serverUrl).post('graphql');
  const response = await request.send({
    query,
    variables: {
      email,
    },
  });

  expect(response.status).toEqual(200);
  expect(response.body.data.forgotPassword).toEqual(true);
});

it('change password', async () => {
  const query = `mutation ChangePassword($data: ChangePasswordInput) {
    changePassword(data: $data) {
      token
    }
  }`;

  const request = supertest(global.serverUrl).post('graphql');
  const response = await request.send({
    query,
    variables: {
      data: {
        code: 'fake-code',
        email,
        password,
        deviceName,
      },
    },
  });

  expect(response.status).toEqual(200);
  expect(response.body.data.changePassword.token).toBeDefined();
});

it('ask to activate 2FA', async () => {
  const query = `mutation {
    enable2FA {
      success
      secret
    }
  }`;

  expect(accessToken).toBeDefined();

  const request = supertest(global.serverUrl).post('graphql').set('Authorization', `Bearer ${accessToken}`);
  const response = await request.send({
    query,
    variables: {},
  });

  expect(response.status).toEqual(200);
  expect(response.body.data.enable2FA.success).toEqual(true);
  expect(response.body.data.enable2FA.secret).toEqual(secret2FA);
});

it('finish activation of 2FA', async () => {
  const query = `mutation Verify2FA($totp: String!) {
    verify2FA(totp: $totp)
  }`;

  expect(accessToken).toBeDefined();

  const request = supertest(global.serverUrl).post('graphql').set('Authorization', `Bearer ${accessToken}`);
  const response = await request.send({
    query,
    variables: {
      totp: 'fake-totp',
    },
  });

  expect(response.status).toEqual(200);
  expect(response.body.data.verify2FA).toEqual(true);
});

it('sign in with 2FA', async () => {
  // Sign in normally to check is 2FA is enabled and get short-lived token
  const querySignIn = `mutation SignIn($user: SignInInput) {
    signIn(data: $user) {
      user {
        name
        email
      }
      token
      is2FAEnabled
    }
  }`;

  const requestSignIn = supertest(global.serverUrl).post('graphql');
  const responseSignIn = await requestSignIn.send({
    query: querySignIn,
    variables: {
      user: {
        email,
        password,
        deviceName,
      },
    },
  });

  expect(responseSignIn.status).toEqual(200);
  expect(responseSignIn.body.data.signIn.token).toBeDefined();
  expect(responseSignIn.body.data.signIn.user).toEqual(null);
  expect(responseSignIn.body.data.signIn.is2FAEnabled).toEqual(true);

  // Get short-lived token
  const tempToken: string = responseSignIn.body.data.signIn.token;

  const query = `mutation SignInWith2FA($user: SignInInput) {
    signInWith2FA(data: $user) {
      user {
        name
        email
      }
      token
    }
  }`;

  const request = supertest(global.serverUrl).post('graphql').set('Authorization', `Bearer ${tempToken}`);
  const response = await request.send({
    query,
    variables: {
      user: {
        email,
        password,
        deviceName,
        totp: 'fake-totp',
      },
    },
  });

  expect(response.status).toEqual(200);
  expect(response.body.data.signInWith2FA.token).toBeDefined();
  expect(response.body.data.signInWith2FA.user).toEqual({ name, email });
});
