import sha1 from 'sha1';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class UserController {
  static async postNew(req, res) {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    if (!password) return res.status(400).json({ error: 'Missing password' });
    if (await dbClient.db.collection('users').findOne({ email })) {
      return res.status(400).json({ error: 'Already exist' });
    }
    const user = await dbClient.db.collection('users').insertOne({
      email,
      password: sha1(password),
    });

    return res.status(201).json({
      id: user.insertedId.toString(),
      email,
    });
  }

  static async getMe(req, res) {
    const authToken = req.headers['x-token'];
    if (!authToken) return res.status(401).json({ error: 'Unauthorized' });

    const key = `auth_${authToken}`;
    const userId = await redisClient.get(key);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: new ObjectId(userId) });
    return res.status(201).json({ id: user._id, email: user.email });
  }
}

export default UserController;
