/* eslint-disable jest/valid-expect */
import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import dbClient from '../utils/db';

chai.use(chaiHttp);

describe('tests for dbClient', () => {
  describe('isAlive', () => {
    // eslint-disable-next-line
    it('should return true if db is alive', () => {
      expect(dbClient.isAlive()).to.equal(true);
    });
  });

  describe('number of Users', () => {
    // eslint-disable-next-line
    it('should return the number of users in the DB', async () => {
      const nbUsers = await dbClient.nbUsers();
      expect(nbUsers).to.equal(4); // 4 users in the DB
    });
  });

  describe('number of files', () => {
    // eslint-disable-next-line
    it('should return the number of files in the DB', async () => {
      const nbFiles = await dbClient.nbFiles();
      expect(nbFiles).to.equal(6); // 6 files in the DB
    });
  });

  describe('find a non-existent user', () => {
    // eslint-disable-next-line
    it('should return the right user', async () => {
      const user = await dbClient.findUser({
        email: 'dave@email',
      });
      // eslint-disable-next-line jest/valid-expect
      expect(user).to.equal(null);
    });
  });
});
