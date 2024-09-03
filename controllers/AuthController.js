import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AuthController {
  static async getConnect(req, res) {
    try {
      // Get and check the Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Extract the base64-encoded credentials
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');

      // Split the credentials into their parts
      const [email, password] = credentials.split(':');
      if (!email || !password) {
        return res.status(400).json({ error: 'Missing email or password' });
      }
      const hashedPassword = sha1(password);

      // Check if the user exists
      const user = await dbClient.db.collection('users').findOne({ email, password: hashedPassword });
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      // Generate a new token
      const randomToken = uuidv4();
      const key = `auth_${randomToken}`;

      // Save the token in Redis for 24 hours
      await redisClient.set(key, user._id.toString(), 86400);

      return res.status(200).json({ token: randomToken });
    } catch (error) {
      console.error('Error during authentication:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getDisconnect(req, res) {
    try {
      const authToken = req.headers['x-token'];
      if (!authToken) return res.status(401).json({ error: 'Unauthorized' });

      const key = `auth_${authToken}`;
      const userId = await redisClient.get(key);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      await redisClient.del(key);
      return res.status(204).end();
    } catch (error) {
      console.error('Error during authentication:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default AuthController;
