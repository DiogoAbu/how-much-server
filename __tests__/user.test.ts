import supertest from 'supertest';

beforeAll(async () => {
  await global.startDb();
  await global.startServer();
});

afterAll(async () => {
  await global.server.stop();
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
    const response = await request.send({ query, variables: { user: { name, email, password } } });

    expect(response.status).toEqual(200);
    expect(response.body.data.createAccount.user).toEqual({ name, email });
    expect(response.body).toHaveProperty('data.createAccount.token');
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
    const response = await request.send({ query, variables: { user: { email, password } } });

    expect(response.status).toEqual(200);
    expect(response.body.data.signIn.user).toEqual({ name, email });
    expect(response.body).toHaveProperty('data.signIn.token');
  });
});
