import supertest from 'supertest';

import randomInteger from '!/utils/random-integer';

beforeAll(async () => {
  await global.startDb();
  await global.startServer();
});

afterAll(async () => {
  await global.server.stop();
  await global.db.dropDatabase();
  await global.db.close();
});

describe('user register/login tests', () => {
  const name = 'test';
  const email = 'test@noreply.io';
  const password = 'password';

  it('successfully create account', async () => {
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
          uniqueIdentifier: String(randomInteger(9)),
        },
      },
    });

    expect(response.status).toEqual(200);
    expect(response.body).toHaveProperty('data.createAccount.token');
    expect(response.body.data.createAccount.user).toEqual({ name, email });
  });

  it('successfully sign in', async () => {
    const query = `mutation SignIn($user: SignInInput) {
      signIn(data: $user) {
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
          email,
          password,
          uniqueIdentifier: String(randomInteger(9)),
        },
      },
    });

    expect(response.status).toEqual(200);
    expect(response.body).toHaveProperty('data.signIn.token');
    expect(response.body.data.signIn.user).toEqual({ name, email });
  });
});
